import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "../../core/testing/db";
import { accounts, sessions, tenants, users } from "../../core/db/schema";
import type { Db } from "../../core/db/types";
import { createLogin } from "./credentials";
import { DISABLED_TENANT_AUTH_PATHS, createTenantAuth } from "./tenant-auth";
import { getTenantSession } from "./tenant-session";

const { db: testDb, reset, close } = createTestDb();
const db = testDb as unknown as Db;
const hostConfig = { baseDomain: "localhost:3000", platformHost: "admin.localhost:3000" };
const auth = createTenantAuth(db, { secret: "test-secret-".padEnd(40, "x"), host: hostConfig, protocol: "http" });

const A = "school-a.localhost:3000";
const B = "school-b.localhost:3000";

async function call(host: string, path: string, body?: unknown, cookie?: string) {
  return auth.handler(
    new Request(`http://${host}/api/auth${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        host,
        origin: `http://${host}`,
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

const signIn = (host: string, identifier: string, password: string) => call(host, "/tenant/sign-in", { identifier, password });

const sessionFor = (host: string, cookie: string) =>
  getTenantSession(auth, db, new Headers({ host, cookie }), hostConfig);

async function seed() {
  const [a, b] = await testDb
    .insert(tenants)
    .values([
      { name: "School A", subdomain: "school-a", status: "ACTIVE" },
      { name: "School B", subdomain: "school-b", status: "ACTIVE" },
    ])
    .returning();
  // The same email is a different account in each school, with different passwords.
  const adminA = await createLogin(db, { tenantId: a.id, name: "Admin A", email: "admin@school.test", password: "PasswordA1" });
  const adminB = await createLogin(db, { tenantId: b.id, name: "Admin B", email: "admin@school.test", password: "PasswordB1" });
  // Both schools have a STU-000001 — with the same temporary password, the worst case.
  const studentA = await createLogin(db, { tenantId: a.id, name: "Student A", username: "STU-000001", password: "Student123" });
  await createLogin(db, { tenantId: b.id, name: "Student B", username: "STU-000001", password: "Student123" });
  return { a, b, adminA, adminB, studentA };
}

beforeEach(async () => {
  await reset();
});

afterAll(async () => {
  await close();
});

describe("tenant sign-in (real database)", () => {
  it("signs a user into their own school and records the school on the session", async () => {
    const { a, adminA } = await seed();
    const res = await signIn(A, "admin@school.test", "PasswordA1");
    expect(res.status).toBe(200);

    const session = await sessionFor(A, cookieFrom(res));
    expect(session?.userId).toBe(adminA.id);
    expect(session?.tenant.id).toBe(a.id);
    expect(session?.mustChangePassword).toBe(true); // admin-provisioned logins start flagged
  });

  it("treats the same email in two schools as two separate accounts", async () => {
    const { adminB } = await seed();
    expect((await signIn(B, "admin@school.test", "PasswordA1")).status).toBe(401); // A's password on B
    const res = await signIn(B, "admin@school.test", "PasswordB1");
    expect(res.status).toBe(200);
    expect((await sessionFor(B, cookieFrom(res)))?.userId).toBe(adminB.id);
  });

  it("logs a student into their own school even when another school has the same code and password", async () => {
    const { studentA } = await seed();
    const res = await signIn(A, "stu-000001", "Student123"); // case-insensitive username
    expect((await sessionFor(A, cookieFrom(res)))?.userId).toBe(studentA.id);
  });

  it("refuses a session that is replayed on another school's site", async () => {
    await seed();
    const cookie = cookieFrom(await signIn(A, "admin@school.test", "PasswordA1"));
    expect(await sessionFor(A, cookie)).not.toBeNull();
    expect(await sessionFor(B, cookie)).toBeNull();
  });

  it("gives the same answer for a wrong password, an unknown user and a disabled user", async () => {
    const { adminA } = await seed();
    await testDb.update(users).set({ banned: true }).where(eq(users.id, adminA.id));

    const responses = await Promise.all([
      signIn(A, "student-typo@school.test", "whatever1"),
      signIn(A, "stu-000001", "WrongPass1"),
      signIn(A, "admin@school.test", "PasswordA1"), // right password, but disabled
    ]);
    const bodies = await Promise.all(responses.map((r) => r.json()));
    for (const [i, res] of responses.entries()) {
      expect(res.status).toBe(401);
      expect(bodies[i]).toMatchObject({ code: "AUTH_INVALID_CREDENTIALS" });
    }
    expect(new Set(bodies.map((b) => b.message)).size).toBe(1);
  });

  it("blocks login for PENDING and DEACTIVATED schools but allows it for SUSPENDED ones", async () => {
    const { a } = await seed();
    for (const status of ["PENDING", "DEACTIVATED"] as const) {
      await testDb.update(tenants).set({ status }).where(eq(tenants.id, a.id));
      const res = await signIn(A, "admin@school.test", "PasswordA1");
      expect(res.status).toBe(403);
      expect(await res.json()).toMatchObject({ code: "TENANT_INACTIVE" });
    }
    await testDb.update(tenants).set({ status: "SUSPENDED" }).where(eq(tenants.id, a.id));
    expect((await signIn(A, "admin@school.test", "PasswordA1")).status).toBe(200);
  });

  it("refuses a sign-in posted from another site (login CSRF), even without a cookie", async () => {
    await seed();
    const res = await auth.handler(
      new Request(`http://${A}/api/auth/tenant/sign-in`, {
        method: "POST",
        headers: { host: A, origin: "http://evil.example.com", "content-type": "application/json" },
        body: JSON.stringify({ identifier: "admin@school.test", password: "PasswordA1" }),
      }),
    );
    expect(res.status).toBe(403);
    expect(res.headers.getSetCookie()).toHaveLength(0);
  });

  it("refuses a sign-in posted from another school's site", async () => {
    await seed();
    const res = await auth.handler(
      new Request(`http://${A}/api/auth/tenant/sign-in`, {
        method: "POST",
        headers: { host: A, origin: `http://${B}`, "content-type": "application/json" },
        body: JSON.stringify({ identifier: "admin@school.test", password: "PasswordA1" }),
      }),
    );
    expect(res.status).toBe(403);
  });

  it("returns 404 for a school that doesn't exist", async () => {
    await seed();
    expect((await signIn("no-such-school.localhost:3000", "admin@school.test", "PasswordA1")).status).toBe(404);
  });

  it("stores only an Argon2id hash, never the password", async () => {
    const { adminA } = await seed();
    const [account] = await testDb.select().from(accounts).where(eq(accounts.userId, adminA.id));
    expect(account.password).toMatch(/^\$argon2id\$/);
    expect(account.password).not.toContain("PasswordA1");
  });

  it("signs out", async () => {
    await seed();
    const cookie = cookieFrom(await signIn(A, "admin@school.test", "PasswordA1"));
    expect((await call(A, "/sign-out", {}, cookie)).status).toBe(200);
    expect(await sessionFor(A, cookie)).toBeNull();
  });

  it("rate-limits repeated sign-in attempts", async () => {
    await seed();
    const statuses: number[] = [];
    for (let i = 0; i < 12; i++) statuses.push((await signIn(A, "admin@school.test", "WrongPass1")).status);
    expect(statuses.slice(0, 10).every((s) => s === 401)).toBe(true);
    expect(statuses.at(-1)).toBe(429);
  });
});

describe("tenant change password (real database)", () => {
  it("requires the correct current password and a valid new one", async () => {
    await seed();
    const cookie = cookieFrom(await signIn(A, "admin@school.test", "PasswordA1"));
    const wrong = await call(A, "/tenant/change-password", { currentPassword: "Nope12345", newPassword: "NewPassword1" }, cookie);
    expect(wrong.status).toBe(400);
    const weak = await call(A, "/tenant/change-password", { currentPassword: "PasswordA1", newPassword: "short" }, cookie);
    expect(weak.status).toBe(422);
    const same = await call(A, "/tenant/change-password", { currentPassword: "PasswordA1", newPassword: "PasswordA1" }, cookie);
    expect(same.status).toBe(422);
  });

  it("changes the password, clears the must-change flag and signs out other devices", async () => {
    const { adminA } = await seed();
    const laptop = cookieFrom(await signIn(A, "admin@school.test", "PasswordA1"));
    const phone = cookieFrom(await signIn(A, "admin@school.test", "PasswordA1"));

    const res = await call(A, "/tenant/change-password", { currentPassword: "PasswordA1", newPassword: "NewPassword1" }, laptop);
    expect(res.status).toBe(200);

    expect((await sessionFor(A, laptop))?.mustChangePassword).toBe(false); // this device stays signed in
    expect(await sessionFor(A, phone)).toBeNull(); // the other device is signed out
    expect((await signIn(A, "admin@school.test", "PasswordA1")).status).toBe(401);
    expect((await signIn(A, "admin@school.test", "NewPassword1")).status).toBe(200);
    expect((await testDb.select().from(sessions).where(eq(sessions.userId, adminA.id))).length).toBe(2);
  });

  it("refuses to change the password without a session", async () => {
    await seed();
    const res = await call(A, "/tenant/change-password", { currentPassword: "PasswordA1", newPassword: "NewPassword1" });
    expect(res.status).toBe(401);
  });
});

describe("tenant auth endpoint surface", () => {
  it("exposes only the endpoints we use — built-in sign-up, email sign-in, resets and profile edits stay off", () => {
    const enabled = Object.values(auth.api as Record<string, { path?: string }>)
      .map((e) => e.path)
      .filter((p): p is string => !!p && !DISABLED_TENANT_AUTH_PATHS.includes(p))
      .sort();
    expect(enabled).toEqual([
      "/error",
      "/get-session",
      "/list-sessions",
      "/ok",
      "/revoke-other-sessions",
      "/revoke-session",
      "/revoke-sessions",
      "/sign-out",
      "/tenant/change-password",
      "/tenant/sign-in",
    ]);
  });

  it("returns 404 for disabled built-in endpoints", async () => {
    for (const path of ["/sign-up/email", "/sign-in/email", "/request-password-reset", "/update-user"]) {
      expect((await call(A, path, {})).status).toBe(404);
    }
  });
});

describe("sign-in identifiers", () => {
  it("signs an instructor in by mobile number, in any common format", async () => {
    const { a } = await seed();
    const instructor = await createLogin(db, { tenantId: a.id, name: "Instructor", phone: "+880 1712-345678", password: "Teach1234" });
    expect(instructor.phone).toBe("01712345678");
    for (const identifier of ["01712345678", "+8801712345678"]) {
      const res = await signIn(A, identifier, "Teach1234");
      expect(res.status, identifier).toBe(200);
      expect((await sessionFor(A, cookieFrom(res)))?.userId).toBe(instructor.id);
    }
  });

  it("signs a student in by their student ID, case-insensitively", async () => {
    const { studentA } = await seed();
    const res = await signIn(A, "stu-000001", "Student123");
    expect(res.status).toBe(200);
    expect((await sessionFor(A, cookieFrom(res)))?.userId).toBe(studentA.id);
  });

  it("never signs in a banned user, such as a student who isn't Active", async () => {
    const { studentA } = await seed();
    await testDb.update(users).set({ banned: true }).where(eq(users.id, studentA.id));
    expect((await signIn(A, "STU-000001", "Student123")).status).toBe(401);
  });

  it("refuses a username that could be mistaken for an email or a mobile number", async () => {
    const { a } = await seed();
    for (const username of ["01712345678", "x@y"]) {
      await expect(createLogin(db, { tenantId: a.id, name: "S", username, password: "Student123" })).rejects.toMatchObject({
        code: "VALIDATION_USERNAME",
      });
    }
  });

  it("refuses an invalid mobile number", async () => {
    const { a } = await seed();
    await expect(createLogin(db, { tenantId: a.id, name: "I", phone: "12345", password: "Teach1234" })).rejects.toMatchObject({
      code: "VALIDATION_PHONE",
    });
  });
});
