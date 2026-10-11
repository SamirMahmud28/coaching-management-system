import { betterAuth, type BetterAuthPlugin } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthEndpoint, sessionMiddleware } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import { and, eq, ne, or, sql } from "drizzle-orm";
import { z } from "zod";
import { accounts, rateLimits, sessions, users, verifications } from "../../core/db/schema";
import type { Db } from "../../core/db/types";
import type { HostConfig } from "../../core/tenancy/host";
import { resolveHost, type Tenant } from "../../core/tenancy/resolve";
import { normalizeBdMobile } from "@/lib/bd-phone";
import { hashPassword, verifyPassword } from "./password";
import {
  CURRENT_PASSWORD_INCORRECT,
  DISABLED_BUILTIN_AUTH_PATHS,
  INVALID_CREDENTIALS,
  assertSameOrigin,
  assertValidNewPassword,
} from "./shared";

// Logins are unique per institute, not globally, so sign-in is a custom endpoint scoped by the
// Host header; Better Auth's built-in email/username sign-in would look users up across institutes.

const DAY = 60 * 60 * 24;

export interface TenantAuthConfig {
  secret: string;
  host: HostConfig;
  protocol: "http" | "https";
}

export const DISABLED_TENANT_AUTH_PATHS = DISABLED_BUILTIN_AUTH_PATHS;

async function resolveTenantFromHeaders(db: Db, headers: Headers | undefined, host: HostConfig): Promise<Tenant> {
  const resolved = await resolveHost(db, headers?.get("host"), host);
  if (resolved.kind !== "tenant") {
    throw new APIError("NOT_FOUND", { code: "NOT_FOUND_TENANT", message: "Institute not found." });
  }
  return resolved.tenant;
}

function tenantCredentialsPlugin(db: Db, config: TenantAuthConfig) {
  return {
    id: "tenant-credentials",
    endpoints: {
      tenantSignIn: createAuthEndpoint(
        "/tenant/sign-in",
        {
          method: "POST",
          body: z.object({
            // Email or mobile number (admins, instructors), or a student ID (D17).
            identifier: z.string().min(1).max(254),
            password: z.string().min(1).max(200),
          }),
        },
        async (ctx) => {
          const headers = ctx.headers ?? ctx.request?.headers;
          assertSameOrigin(headers, `${config.protocol}://${headers?.get("host")}`);
          const tenant = await resolveTenantFromHeaders(db, headers, config.host);
          // SUSPENDED institutes may still sign in; their writes are blocked per request.
          if (tenant.status === "PENDING" || tenant.status === "DEACTIVATED") {
            throw new APIError("FORBIDDEN", { code: "TENANT_INACTIVE", message: "This institute's account isn't active." });
          }

          const identifier = ctx.body.identifier.trim().toLowerCase();
          const phone = normalizeBdMobile(identifier);
          // Identifiers can't collide across kinds: a student ID is never a valid mobile number or contains "@" (M6).
          const [user] = await db
            .select()
            .from(users)
            .where(
              and(
                eq(users.tenantId, tenant.id),
                or(
                  eq(sql`lower(${users.email})`, identifier),
                  eq(sql`lower(${users.username})`, identifier),
                  phone ? eq(users.phone, phone) : undefined,
                ),
              ),
            )
            .limit(1);

          if (!user) {
            await hashPassword(ctx.body.password); // equalise timing so unknown users aren't detectable
            throw new APIError("UNAUTHORIZED", INVALID_CREDENTIALS);
          }
          const account = await ctx.context.internalAdapter.findCredentialAccount(user.id);
          const passwordOk = account?.password ? await verifyPassword(account.password, ctx.body.password) : false;
          if (!passwordOk || user.banned) throw new APIError("UNAUTHORIZED", INVALID_CREDENTIALS);

          const session = await ctx.context.internalAdapter.createSession(user.id, false, { tenantId: tenant.id }, true);
          const authUser = await ctx.context.internalAdapter.findUserById(user.id);
          if (!session || !authUser) {
            throw new APIError("INTERNAL_SERVER_ERROR", { code: "INTERNAL_ERROR", message: "Couldn't sign you in. Please try again." });
          }
          await setSessionCookie(ctx, { session, user: authUser });
          return ctx.json({ user: { id: user.id, name: user.name, mustChangePassword: user.mustChangePassword } });
        },
      ),

      tenantChangePassword: createAuthEndpoint(
        "/tenant/change-password",
        {
          method: "POST",
          use: [sessionMiddleware],
          body: z.object({
            currentPassword: z.string().min(1).max(200),
            newPassword: z.string().min(1).max(200),
          }),
        },
        async (ctx) => {
          const tenant = await resolveTenantFromHeaders(db, ctx.headers ?? ctx.request?.headers, config.host);
          const { session, user } = ctx.context.session;
          if ((session as { tenantId?: string }).tenantId !== tenant.id) {
            throw new APIError("UNAUTHORIZED", { code: "AUTH_REQUIRED", message: "Please sign in to continue." });
          }

          const { currentPassword, newPassword } = ctx.body;
          assertValidNewPassword(currentPassword, newPassword);
          const account = await ctx.context.internalAdapter.findCredentialAccount(user.id);
          if (!account?.password || !(await verifyPassword(account.password, currentPassword))) {
            throw new APIError("BAD_REQUEST", CURRENT_PASSWORD_INCORRECT);
          }

          await ctx.context.internalAdapter.updatePassword(user.id, await hashPassword(newPassword));
          await db.update(users).set({ mustChangePassword: false, updatedAt: new Date() }).where(eq(users.id, user.id));
          await db.delete(sessions).where(and(eq(sessions.userId, user.id), ne(sessions.token, session.token)));
          return ctx.json({ success: true });
        },
      ),
    },
  } satisfies BetterAuthPlugin;
}

export function createTenantAuth(db: Db, config: TenantAuthConfig) {
  const originPattern = `${config.protocol}://*.${config.host.baseDomain}`;

  return betterAuth({
    appName: "cms",
    secret: config.secret,
    basePath: "/api/auth",
    baseURL: { allowedHosts: [`*.${config.host.baseDomain}`], protocol: config.protocol },
    trustedOrigins: [originPattern],
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: { user: users, session: sessions, account: accounts, verification: verifications, rateLimit: rateLimits },
    }),
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      password: { hash: hashPassword, verify: ({ hash, password }) => verifyPassword(hash, password) },
    },
    user: {
      additionalFields: {
        tenantId: { type: "string", required: true, input: false },
        username: { type: "string", required: false, input: false },
        mustChangePassword: { type: "boolean", required: false, defaultValue: false, input: false },
        banned: { type: "boolean", required: false, defaultValue: false, input: false },
      },
    },
    session: {
      expiresIn: 7 * DAY,
      updateAge: DAY,
      // No cookie cache: disabling a user takes effect on the next request.
      cookieCache: { enabled: false },
      additionalFields: {
        tenantId: { type: "string", required: true, input: false },
      },
    },
    rateLimit: {
      enabled: true,
      storage: "database",
      window: 60,
      max: 100,
      customRules: { "/tenant/sign-in": { window: 60, max: 10 } },
    },
    disabledPaths: DISABLED_TENANT_AUTH_PATHS,
    advanced: {
      cookiePrefix: "cms",
      database: { generateId: "uuid" },
    },
    plugins: [tenantCredentialsPlugin(db, config)],
  });
}

export type TenantAuth = ReturnType<typeof createTenantAuth>;
