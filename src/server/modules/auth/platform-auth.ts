import { betterAuth, type BetterAuthPlugin } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthEndpoint, sessionMiddleware } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import { and, eq, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { platformAccounts, platformSessions, platformUsers, platformVerifications, rateLimits } from "../../core/db/schema";
import type { Db } from "../../core/db/types";
import { audit, type PlatformLoginFailureReason } from "../audit/service";
import { hashPassword, verifyPassword } from "./password";
import {
  CURRENT_PASSWORD_INCORRECT,
  DISABLED_BUILTIN_AUTH_PATHS,
  INVALID_CREDENTIALS,
  assertSameOrigin,
  assertValidNewPassword,
} from "./shared";

// Separate instance from the tenant one: own tables, secret and cookie, so neither session works on the other host.

const HOUR = 60 * 60;

export interface PlatformAuthConfig {
  secret: string;
  platformHost: string;
  protocol: "http" | "https";
}

export const DISABLED_PLATFORM_AUTH_PATHS = DISABLED_BUILTIN_AUTH_PATHS;

function platformCredentialsPlugin(db: Db, config: PlatformAuthConfig) {
  const origin = `${config.protocol}://${config.platformHost}`;

  return {
    id: "platform-credentials",
    endpoints: {
      platformLogin: createAuthEndpoint(
        "/login",
        {
          method: "POST",
          body: z.object({
            email: z.string().min(1).max(254),
            password: z.string().min(1).max(200),
          }),
        },
        async (ctx) => {
          const headers = ctx.headers ?? ctx.request?.headers;
          assertSameOrigin(headers, origin);

          const email = ctx.body.email.trim().toLowerCase();
          const fail = async (platformUserId: string | null, reason: PlatformLoginFailureReason): Promise<never> => {
            await audit.recordPlatformLoginFailure(db, {
              platformUserId,
              email,
              reason,
              // Set by nginx (which overwrites any client-sent value); absent in local dev.
              ipAddress: headers?.get("x-forwarded-for")?.split(",")[0]?.trim() || null,
              userAgent: headers?.get("user-agent") ?? null,
            });
            throw new APIError("UNAUTHORIZED", INVALID_CREDENTIALS);
          };
          const [platformUser] = await db
            .select()
            .from(platformUsers)
            .where(eq(sql`lower(${platformUsers.email})`, email))
            .limit(1);

          if (!platformUser) {
            await hashPassword(ctx.body.password); // equalise timing so unknown emails aren't detectable
            return fail(null, "UNKNOWN_EMAIL");
          }
          const account = await ctx.context.internalAdapter.findCredentialAccount(platformUser.id);
          const passwordOk = account?.password ? await verifyPassword(account.password, ctx.body.password) : false;
          if (!passwordOk) return fail(platformUser.id, "WRONG_PASSWORD");
          if (platformUser.status === "DISABLED") return fail(platformUser.id, "DISABLED");

          const session = await ctx.context.internalAdapter.createSession(platformUser.id, false, {}, true);
          const authUser = await ctx.context.internalAdapter.findUserById(platformUser.id);
          if (!session || !authUser) {
            throw new APIError("INTERNAL_SERVER_ERROR", { code: "INTERNAL_ERROR", message: "Couldn't sign you in. Please try again." });
          }
          await setSessionCookie(ctx, { session, user: authUser });
          return ctx.json({ user: { id: platformUser.id, name: platformUser.name, mustChangePassword: platformUser.mustChangePassword } });
        },
      ),

      platformChangePassword: createAuthEndpoint(
        "/platform/change-password",
        {
          method: "POST",
          use: [sessionMiddleware],
          body: z.object({
            currentPassword: z.string().min(1).max(200),
            newPassword: z.string().min(1).max(200),
          }),
        },
        async (ctx) => {
          const { session, user } = ctx.context.session;
          const { currentPassword, newPassword } = ctx.body;
          assertValidNewPassword(currentPassword, newPassword);

          const account = await ctx.context.internalAdapter.findCredentialAccount(user.id);
          if (!account?.password || !(await verifyPassword(account.password, currentPassword))) {
            throw new APIError("BAD_REQUEST", CURRENT_PASSWORD_INCORRECT);
          }

          await ctx.context.internalAdapter.updatePassword(user.id, await hashPassword(newPassword));
          await db.update(platformUsers).set({ mustChangePassword: false, updatedAt: new Date() }).where(eq(platformUsers.id, user.id));
          await db.delete(platformSessions).where(and(eq(platformSessions.userId, user.id), ne(platformSessions.token, session.token)));
          return ctx.json({ success: true });
        },
      ),
    },
  } satisfies BetterAuthPlugin;
}

export function createPlatformAuth(db: Db, config: PlatformAuthConfig) {
  const origin = `${config.protocol}://${config.platformHost}`;

  return betterAuth({
    appName: "cms.platform",
    secret: config.secret,
    basePath: "/api/platform/auth",
    baseURL: { allowedHosts: [config.platformHost], protocol: config.protocol },
    trustedOrigins: [origin],
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: {
        user: platformUsers,
        session: platformSessions,
        account: platformAccounts,
        verification: platformVerifications,
        rateLimit: rateLimits,
      },
    }),
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      password: { hash: hashPassword, verify: ({ hash, password }) => verifyPassword(hash, password) },
    },
    user: {
      additionalFields: {
        status: { type: "string", required: false, defaultValue: "ACTIVE", input: false },
        mustChangePassword: { type: "boolean", required: false, defaultValue: false, input: false },
      },
    },
    session: {
      // Fixed 8 hours. updateAge == expiresIn disables sliding refresh (updateAge: 0 would refresh on every request).
      expiresIn: 8 * HOUR,
      updateAge: 8 * HOUR,
      cookieCache: { enabled: false },
    },
    rateLimit: {
      enabled: true,
      storage: "database",
      window: 60,
      max: 100,
      customRules: { "/login": { window: 60, max: 10 } },
    },
    disabledPaths: DISABLED_PLATFORM_AUTH_PATHS,
    advanced: {
      cookiePrefix: "cms-admin",
      database: { generateId: "uuid" },
    },
    plugins: [platformCredentialsPlugin(db, config)],
  });
}

export type PlatformAuth = ReturnType<typeof createPlatformAuth>;
