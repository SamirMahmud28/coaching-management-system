import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "../../core/testing/db";
import { auditLogs, platformAccounts, platformSessions, platformUsers, tenants } from "../../core/db/schema";
import type { Db } from "../../core/db/types";
import { createLogin } from "./credentials";
import { createPlatformLogin } from "./platform-credentials";
import { DISABLED_PLATFORM_AUTH_PATHS, createPlatformAuth } from "./platform-auth";
import { getPlatformSession } from "./platform-session";
import { createTenantAuth } from "./tenant-auth";

const { db: testDb, reset, close } = createTestDb();
const db = testDb as unknown as Db;
const HOST = "admin.localhost:3000";
const hostConfig = { baseDomain: "localhost:3000", platformHost: HOST };
const auth = createPlatformAuth(db, { secret: "test-secret-".padEnd(40, "x"), platformHost: HOST, protocol: "http" });
const tenantAuth = createTenantAuth(db, { secret: "tenant-secret-".padEnd(40, "x"), host: hostConfig, protocol: "http" });

async function call(path: string, body?: unknown, cookie?: string) {
  return auth.handler(
    new Request(`http://${HOST}/api/platform/auth${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        host: HOST,
        origin: `http://${HOST}`,
        "content-type": "application/json",
        "x-forwarded-for": "203.0.113.7",
        ...(cookie ? { cookie } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
}

const cookieFrom = (res: Response) =>
  res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");

const login = (email: string, password: string) => call("/login", { email, password });

const sessionFor = (cookie: string) => getPlatformSession(auth, new Headers({ host: HOST, cookie }));

async function seed() {
  return createPlatformLogin(db, { name: "Root Admin", email: "root@platform.test", password: "PlatformPass1" });
}

beforeEach(async () => {
  await reset();
});

afterAll(async () => {
  await close();
});

describe("platform login (real database)", () => {
  it("signs a Platform Admin in", async () => {
    const admin = await seed();
    const res = await login("root@platform.test", "PlatformPass1");
    expect(res.status).toBe(200);

    const session = await sessionFor(cookieFrom(res));
    expect(session?.platformUserId).toBe(admin.id);
    expect(session?.mustChangePassword).toBe(true); // provisioned logins start flagged
  });

  it("is case-insensitive on email", async () => {
    const admin = await seed();
    const res = await login("ROOT@Platform.test", "PlatformPass1");
    expect((await sessionFor(cookieFrom(res)))?.platformUserId).toBe(admin.id);
  });

  it("gives the same answer for a wrong password, an unknown admin and a disabled admin", async () => {
    const admin = await seed();
    await testDb.update(platformUsers).set({ status: "DISABLED" }).where(eq(platformUsers.id, admin.id));

    const responses = await Promise.all([
      login("nobody@platform.test", "whatever1"),
      login("root@platform.test", "WrongPass1"),
      login("root@platform.test", "PlatformPass1"), // right password, but disabled
    ]);
    const bodies = await Promise.all(responses.map((r) => r.json()));
    for (const [i, res] of responses.entries()) {
      expect(res.status).toBe(401);
      expect(bodies[i]).toMatchObject({ code: "AUTH_INVALID_CREDENTIALS" });
    }
    expect(new Set(bodies.map((b) => b.message)).size).toBe(1);
  });

  it("audits every failed attempt with the reason and IP, attributing known emails to that admin, and never the password", async () => {
    const admin = await seed();
    await login("nobody@platform.test", "whatever1");
    await login("ROOT@platform.test", "WrongPass1");
    await testDb.update(platformUsers).set({ status: "DISABLED" }).where(eq(platformUsers.id, admin.id));
    await login("root@platform.test", "PlatformPass1");

    const rows = await testDb.select().from(auditLogs).where(eq(auditLogs.action, "PLATFORM_LOGIN_FAILED"));
    const byReason = Object.fromEntries(rows.map((r) => [(r.newValue as { reason: string }).reason, r]));
    expect(byReason.UNKNOWN_EMAIL).toMatchObject({ platformUserId: null, userId: null, tenantId: null, ipAddress: "203.0.113.7", newValue: { email: "nobody@platform.test" } });
    expect(byReason.WRONG_PASSWORD).toMatchObject({ platformUserId: admin.id, newValue: { email: "root@platform.test" } });
    expect(byReason.DISABLED).toMatchObject({ platformUserId: admin.id });
    expect(JSON.stringify(rows)).not.toMatch(/WrongPass1|PlatformPass1|whatever1/);

    await testDb.update(platformUsers).set({ status: "ACTIVE" }).where(eq(platformUsers.id, admin.id));
    await login("root@platform.test", "PlatformPass1");
    expect(await testDb.select().from(auditLogs).where(eq(auditLogs.action, "PLATFORM_LOGIN_FAILED"))).toHaveLength(3);
  });

  it("refuses a login posted from another site (login CSRF), even without a cookie", async () => {
    await seed();
    const res = await auth.handler(
      new Request(`http://${HOST}/api/platform/auth/login`, {
        method: "POST",
        headers: { host: HOST, origin: "http://evil.example.com", "content-type": "application/json" },
        body: JSON.stringify({ email: "root@platform.test", password: "PlatformPass1" }),
      }),
    );
    expect(res.status).toBe(403);
    expect(res.headers.getSetCookie()).toHaveLength(0);
  });

  it("stores only an Argon2id hash, never the password", async () => {
    const admin = await seed();
    const [account] = await testDb.select().from(platformAccounts).where(eq(platformAccounts.userId, admin.id));
    expect(account.password).toMatch(/^\$argon2id\$/);
    expect(account.password).not.toContain("PlatformPass1");
  });

  it("signs out", async () => {
    await seed();
    const cookie = cookieFrom(await login("root@platform.test", "PlatformPass1"));
    expect((await call("/sign-out", {}, cookie)).status).toBe(200);
    expect(await sessionFor(cookie)).toBeNull();
  });

  it("rate-limits repeated login attempts", async () => {
    await seed();
    const statuses: number[] = [];
    for (let i = 0; i < 12; i++) statuses.push((await login("root@platform.test", "WrongPass1")).status);
    expect(statuses.slice(0, 10).every((s) => s === 401)).toBe(true);
    expect(statuses.at(-1)).toBe(429);
  });
});

describe("platform change password (real database)", () => {
  it("requires the correct current password and a valid new one", async () => {
    await seed();
    const cookie = cookieFrom(await login("root@platform.test", "PlatformPass1"));
    const wrong = await call("/platform/change-password", { currentPassword: "Nope12345", newPassword: "NewPassword1" }, cookie);
    expect(wrong.status).toBe(400);
    const weak = await call("/platform/change-password", { currentPassword: "PlatformPass1", newPassword: "short" }, cookie);
    expect(weak.status).toBe(422);
    const same = await call("/platform/change-password", { currentPassword: "PlatformPass1", newPassword: "PlatformPass1" }, cookie);
    expect(same.status).toBe(422);
  });

  it("changes the password, clears the must-change flag and signs out other devices", async () => {
    const admin = await seed();
    const laptop = cookieFrom(await login("root@platform.test", "PlatformPass1"));
    const phone = cookieFrom(await login("root@platform.test", "PlatformPass1"));

    const res = await call("/platform/change-password", { currentPassword: "PlatformPass1", newPassword: "NewPassword1" }, laptop);
    expect(res.status).toBe(200);

    expect((await sessionFor(laptop))?.mustChangePassword).toBe(false); // this device stays signed in
    expect(await sessionFor(phone)).toBeNull(); // the other device is signed out
    expect((await login("root@platform.test", "PlatformPass1")).status).toBe(401);
    expect((await login("root@platform.test", "NewPassword1")).status).toBe(200);
    expect((await testDb.select().from(platformSessions).where(eq(platformSessions.userId, admin.id))).length).toBe(2);
  });

  it("refuses to change the password without a session", async () => {
    await seed();
    const res = await call("/platform/change-password", { currentPassword: "PlatformPass1", newPassword: "NewPassword1" });
    expect(res.status).toBe(401);
  });
});

describe("cross-instance isolation", () => {
  it("never authenticates a tenant cookie on the platform instance", async () => {
    const [tenant] = await testDb
      .insert(tenants)
      .values({ name: "School A", subdomain: "school-a", status: "ACTIVE" })
      .returning();
    await createLogin(db, { tenantId: tenant.id, name: "Admin A", email: "admin@school.test", password: "PasswordA1" });

    const tenantRes = await tenantAuth.handler(
      new Request(`http://school-a.localhost:3000/api/auth/tenant/sign-in`, {
        method: "POST",
        headers: { host: "school-a.localhost:3000", origin: "http://school-a.localhost:3000", "content-type": "application/json" },
        body: JSON.stringify({ identifier: "admin@school.test", password: "PasswordA1" }),
      }),
    );
    const tenantCookie = tenantRes.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
    expect(tenantCookie).toContain("cms.session_token"); // distinct cookie name from the platform instance
    expect(await sessionFor(tenantCookie)).toBeNull();
  });

  it("never authenticates a platform cookie on the tenant instance", async () => {
    await testDb.insert(tenants).values({ name: "School A", subdomain: "school-a", status: "ACTIVE" });
    await seed();

    const platformCookie = cookieFrom(await login("root@platform.test", "PlatformPass1"));
    expect(platformCookie).toContain("cms-admin.session_token"); // distinct cookie name from the tenant instance
    const result = await tenantAuth.api.getSession({ headers: new Headers({ host: "school-a.localhost:3000", cookie: platformCookie }) });
    expect(result).toBeNull();
  });
});

describe("platform auth endpoint surface", () => {
  it("exposes only the endpoints we use — built-in sign-up, email sign-in, resets and profile edits stay off", () => {
    const enabled = Object.values(auth.api as Record<string, { path?: string }>)
      .map((e) => e.path)
      .filter((p): p is string => !!p && !DISABLED_PLATFORM_AUTH_PATHS.includes(p))
      .sort();
    expect(enabled).toEqual([
      "/error",
      "/get-session",
      "/list-sessions",
      "/login",
      "/ok",
      "/platform/change-password",
      "/revoke-other-sessions",
      "/revoke-session",
      "/revoke-sessions",
      "/sign-out",
    ]);
  });

  it("returns 404 for disabled built-in endpoints", async () => {
    for (const path of ["/sign-up/email", "/sign-in/email", "/request-password-reset", "/update-user"]) {
      expect((await call(path, {})).status).toBe(404);
    }
  });
});
