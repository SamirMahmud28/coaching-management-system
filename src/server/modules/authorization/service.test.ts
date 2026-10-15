import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "../../core/testing/db";
import { permissions, platformUsers, rolePermissions, roles, tenants, userRoles, users } from "../../core/db/schema";
import type { Db } from "../../core/db/types";
import { seedPlatformCatalog } from "../../core/db/seed";
import type { PermissionName } from "../../core/rbac/catalog";
import { createLogin } from "../auth/credentials";
import { createTenantAuth } from "../auth/tenant-auth";
import { setTenantModules } from "../entitlements/service";
import { getActivePermissions, withAuthorization } from "./service";

const { db: testDb, reset, close } = createTestDb();
const db = testDb as unknown as Db;
const hostConfig = { baseDomain: "localhost:3000", platformHost: "admin.localhost:3000" };
const auth = createTenantAuth(db, { secret: "test-secret-".padEnd(40, "x"), host: hostConfig, protocol: "http" });
const HOST = "inst-a.localhost:3000";

beforeEach(async () => {
  await reset();
  await seedPlatformCatalog(testDb);
});

afterAll(async () => {
  await close();
});

async function permissionIdsByName(names: readonly PermissionName[]): Promise<string[]> {
  const rows = await testDb.select({ id: permissions.id, name: permissions.name }).from(permissions);
  const byName = new Map(rows.map((r) => [r.name, r.id]));
  return names.map((n) => byName.get(n)!);
}

async function seed(granted: readonly PermissionName[] = ["students.view", "modules.view", "fees.view"]) {
  const [tenant] = await testDb.insert(tenants).values({ name: "Institute A", subdomain: "inst-a", status: "ACTIVE" }).returning();
  const [role] = await testDb.insert(roles).values({ tenantId: tenant.id, name: "Clerk", isSystem: false }).returning();
  const permissionIds = await permissionIdsByName(granted);
  await testDb.insert(rolePermissions).values(permissionIds.map((permissionId) => ({ tenantId: tenant.id, roleId: role.id, permissionId })));

  const user = await createLogin(db, { tenantId: tenant.id, name: "Clerk A", email: "clerk@inst.test", password: "Clerk1234" });
  await testDb.insert(userRoles).values({ tenantId: tenant.id, userId: user.id, roleId: role.id });

  const [platformUser] = await testDb.insert(platformUsers).values({ name: "Admin", email: `admin-${Date.now()}@platform.test` }).returning();
  return { tenant, user, platformUser };
}

async function signInCookie(host: string, identifier: string, password: string): Promise<string> {
  const res = await auth.handler(
    new Request(`http://${host}/api/auth/tenant/sign-in`, {
      method: "POST",
      headers: { host, origin: `http://${host}`, "content-type": "application/json" },
      body: JSON.stringify({ identifier, password }),
    }),
  );
  return res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
}

const call = (cookie: string, permission: PermissionName, method = "GET", extra: Record<string, string> = {}, host = HOST) =>
  withAuthorization({ db, auth, headers: new Headers({ host, cookie, ...extra }), host: hostConfig, method, permission });

describe("withAuthorization (real database)", () => {
  it("rejects with no session", async () => {
    await seed();
    await expect(call("", "students.view")).rejects.toMatchObject({ code: "AUTH_REQUIRED", status: 401 });
  });

  it("rejects a session presented on another institute's host", async () => {
    await seed();
    await testDb.insert(tenants).values({ name: "Institute B", subdomain: "inst-b", status: "ACTIVE" });
    const cookie = await signInCookie(HOST, "clerk@inst.test", "Clerk1234");
    await expect(call(cookie, "students.view", "GET", {}, "inst-b.localhost:3000")).rejects.toMatchObject({ code: "AUTH_REQUIRED" });
  });

  it("rejects a PENDING or DEACTIVATED institute even with a session that was valid when it was created", async () => {
    const { tenant } = await seed();
    const cookie = await signInCookie(HOST, "clerk@inst.test", "Clerk1234");
    for (const status of ["PENDING", "DEACTIVATED"] as const) {
      await testDb.update(tenants).set({ status }).where(eq(tenants.id, tenant.id));
      await expect(call(cookie, "students.view")).rejects.toMatchObject({ code: "TENANT_INACTIVE", status: 403 });
    }
  });

  it("rejects a write for a SUSPENDED institute but allows a read", async () => {
    const { tenant } = await seed();
    const cookie = await signInCookie(HOST, "clerk@inst.test", "Clerk1234");
    await testDb.update(tenants).set({ status: "SUSPENDED" }).where(eq(tenants.id, tenant.id));
    await expect(call(cookie, "students.view", "POST")).rejects.toMatchObject({ code: "TENANT_SUSPENDED", status: 403 });
    expect((await call(cookie, "students.view")).tenant.id).toBe(tenant.id);
  });

  it("derives the module from the permission: a paid module that isn't switched on is MODULE_INACTIVE", async () => {
    const { tenant, platformUser } = await seed();
    const cookie = await signInCookie(HOST, "clerk@inst.test", "Clerk1234");
    await expect(call(cookie, "fees.view")).rejects.toMatchObject({ code: "MODULE_INACTIVE", status: 403 });

    await setTenantModules(db, { tenantId: tenant.id, changes: [{ key: "fees", enabled: true }], platformUserId: platformUser.id });
    expect((await call(cookie, "fees.view")).permissions.has("fees.view")).toBe(true);

    await setTenantModules(db, { tenantId: tenant.id, changes: [{ key: "fees", enabled: false }], platformUserId: platformUser.id });
    await expect(call(cookie, "fees.view")).rejects.toMatchObject({ code: "MODULE_INACTIVE" });
  });

  it("treats Core permissions as always active", async () => {
    const { tenant } = await seed();
    const cookie = await signInCookie(HOST, "clerk@inst.test", "Clerk1234");
    expect((await call(cookie, "modules.view")).tenant.id).toBe(tenant.id);
  });

  it("rejects when the user lacks the required permission", async () => {
    await seed();
    const cookie = await signInCookie(HOST, "clerk@inst.test", "Clerk1234");
    await expect(call(cookie, "students.create", "POST")).rejects.toMatchObject({ code: "PERM_DENIED", status: 403 });
  });

  it("refuses a write whose Origin is another host, but not a same-host write or a read", async () => {
    const { tenant } = await seed();
    const cookie = await signInCookie(HOST, "clerk@inst.test", "Clerk1234");
    await expect(call(cookie, "students.view", "POST", { origin: "http://other.localhost:3000" })).rejects.toMatchObject({ code: "INVALID_ORIGIN" });
    await expect(call(cookie, "students.view", "DELETE", { origin: "null" })).rejects.toMatchObject({ code: "INVALID_ORIGIN" });
    expect((await call(cookie, "students.view", "POST", { origin: `http://${HOST}` })).tenant.id).toBe(tenant.id);
    expect((await call(cookie, "students.view", "GET", { origin: "http://other.localhost:3000" })).tenant.id).toBe(tenant.id);
  });

  it("drops a banned user's access on the next request (e.g. a student put On Hold)", async () => {
    const { user } = await seed();
    const cookie = await signInCookie(HOST, "clerk@inst.test", "Clerk1234");
    await testDb.update(users).set({ banned: true }).where(eq(users.id, user.id));
    await expect(call(cookie, "students.view")).rejects.toMatchObject({ code: "AUTH_REQUIRED" });
  });
});

describe("getActivePermissions", () => {
  it("leaves out permissions of modules that aren't switched on", async () => {
    const { tenant, user, platformUser } = await seed();
    let result = await getActivePermissions(db, tenant.id, user.id);
    expect([...result.permissions].sort()).toEqual(["modules.view", "students.view"]);
    expect(result.activeModules).toEqual(["core"]);

    await setTenantModules(db, { tenantId: tenant.id, changes: [{ key: "fees", enabled: true }], platformUserId: platformUser.id });
    result = await getActivePermissions(db, tenant.id, user.id);
    expect(result.permissions.has("fees.view")).toBe(true);
    expect(result.activeModules).toEqual(["core", "fees"]);
  });
});
