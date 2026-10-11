import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "../../core/testing/db";
import { permissions, rolePermissions, roles, tenants, userRoles, users } from "../../core/db/schema";
import type { Db } from "../../core/db/types";
import { seedPlatformCatalog } from "../../core/db/seed";
import { INSTITUTE_OWNER_ROLE } from "../../core/rbac/catalog";
import { audit } from "../audit/service";
import { createLogin } from "../auth/credentials";
import { createTenantAuth } from "../auth/tenant-auth";
import { seedBaselineRoles } from "../rbac/service";
import { createInstituteHandlers } from "./http";

const { db: testDb, reset, close } = createTestDb();
const db = testDb as unknown as Db;
const host = { baseDomain: "localhost:3000", platformHost: "admin.localhost:3000" };
const auth = createTenantAuth(db, { secret: "test-secret-".padEnd(40, "x"), host, protocol: "http" });
const h = createInstituteHandlers({ db, auth, host });

beforeEach(async () => {
  await reset();
  await seedPlatformCatalog(testDb);
});
afterAll(async () => {
  await close();
});

const HOST = (sub: string) => `${sub}.localhost:3000`;

function req(sub: string, method: string, path: string, opts: { body?: unknown; cookie?: string } = {}) {
  return new Request(`http://${HOST(sub)}${path}`, {
    method,
    headers: { host: HOST(sub), origin: `http://${HOST(sub)}`, "content-type": "application/json", ...(opts.cookie ? { cookie: opts.cookie } : {}) },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
}

async function signIn(sub: string, identifier: string, password: string) {
  const res = await auth.handler(
    new Request(`http://${HOST(sub)}/api/auth/tenant/sign-in`, {
      method: "POST",
      headers: { host: HOST(sub), origin: `http://${HOST(sub)}`, "content-type": "application/json" },
      body: JSON.stringify({ identifier, password }),
    }),
  );
  return { status: res.status, cookie: res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ") };
}

/** An institute as createTenant leaves it: role templates and an Owner, plus helpers to add signed-in users. */
async function institute(sub: string) {
  const [tenant] = await testDb.insert(tenants).values({ name: `Institute ${sub}`, subdomain: sub, status: "ACTIVE" }).returning();
  const roleIds = await seedBaselineRoles(db, tenant.id);
  const owner = await createLogin(db, { tenantId: tenant.id, name: "Owner", email: `owner@${sub}.test`, password: "OwnerPass1", mustChangePassword: false });
  await testDb.insert(userRoles).values({ tenantId: tenant.id, userId: owner.id, roleId: roleIds[INSTITUTE_OWNER_ROLE] });
  await testDb.update(tenants).set({ ownerUserId: owner.id }).where(eq(tenants.id, tenant.id));
  const ownerCookie = (await signIn(sub, `owner@${sub}.test`, "OwnerPass1")).cookie;
  const withRole = async (roleId: string, email: string) => {
    const user = await createLogin(db, { tenantId: tenant.id, name: email, email, password: "SomePass1", mustChangePassword: false });
    await testDb.insert(userRoles).values({ tenantId: tenant.id, userId: user.id, roleId });
    return { user, cookie: (await signIn(sub, email, "SomePass1")).cookie };
  };
  return { tenant, roleIds, owner, ownerCookie, withRole };
}

describe("institute API access", () => {
  it("needs a session, and the right permission for each endpoint", async () => {
    const a = await institute("inst-a");
    const accountant = await a.withRole(a.roleIds.Accountant, "acc@a.test");
    expect((await h.listUsers(req("inst-a", "GET", "/api/v1/users"))).status).toBe(401);
    // The Accountant has neither users.view, modules.view nor audit.view.
    for (const res of [
      await h.listUsers(req("inst-a", "GET", "/api/v1/users", { cookie: accountant.cookie })),
      await h.listModules(req("inst-a", "GET", "/api/v1/modules", { cookie: accountant.cookie })),
      await h.auditLog(req("inst-a", "GET", "/api/v1/audit-log", { cookie: accountant.cookie })),
    ]) {
      expect(res.status).toBe(403);
      expect((await res.json()).error.code).toBe("PERM_DENIED");
    }
  });
});

describe("modules and requests", () => {
  it("shows Core plus the paid modules, and lets the institute request one once", async () => {
    const a = await institute("inst-a");
    const list = await (await h.listModules(req("inst-a", "GET", "/api/v1/modules", { cookie: a.ownerCookie }))).json();
    expect(list.items.map((m: { key: string }) => m.key)).toEqual(["core", "attendance", "routine", "exams", "fees", "website"]);
    expect(list.items[0]).toMatchObject({ enabled: true, always_on: true });

    const created = await h.requestModule(req("inst-a", "POST", "/api/v1/module-requests", { cookie: a.ownerCookie, body: { module_key: "fees", note: "We collect fees monthly" } }));
    expect(created.status).toBe(201);
    const again = await h.requestModule(req("inst-a", "POST", "/api/v1/module-requests", { cookie: a.ownerCookie, body: { module_key: "fees" } }));
    expect((await again.json()).error.code).toBe("CONFLICT_MODULE_REQUEST_EXISTS");
  });
});

describe("audit log", () => {
  it("never returns another institute's entries, and names the actors", async () => {
    const a = await institute("inst-a");
    const b = await institute("inst-b");
    await audit.record(testDb, { tenantId: a.tenant.id, actorType: "TENANT_USER", userId: a.owner.id, action: "THING_A", resourceType: "X" });
    await audit.record(testDb, { tenantId: b.tenant.id, actorType: "TENANT_USER", userId: b.owner.id, action: "THING_B", resourceType: "X" });
    const page = await (await h.auditLog(req("inst-a", "GET", "/api/v1/audit-log", { cookie: a.ownerCookie }))).json();
    expect(page.items.map((r: { action: string }) => r.action)).toEqual(["THING_A"]);
    expect(page.items[0].actor_name).toBe("Owner");
  });
});

describe("users and roles", () => {
  it("lists users with their roles, without credentials, and the institute's roles", async () => {
    const a = await institute("inst-a");
    const res = await (await h.listUsers(req("inst-a", "GET", "/api/v1/users", { cookie: a.ownerCookie }))).json();
    expect(res.items).toHaveLength(1);
    expect(res.items[0]).toMatchObject({ name: "Owner", is_owner: true, roles: [{ name: "Owner" }] });
    expect(JSON.stringify(res)).not.toMatch(/password"?:\s*"/i);

    const roleList = await (await h.listRoles(req("inst-a", "GET", "/api/v1/roles", { cookie: a.ownerCookie }))).json();
    expect(roleList.items.map((r: { name: string }) => r.name)).toEqual(["Accountant", "Admin", "Instructor", "Owner", "Student"]);
  });

  it("creates a staff login that signs in by mobile number and must change its password", async () => {
    const a = await institute("inst-a");
    const res = await h.createUser(req("inst-a", "POST", "/api/v1/users", {
      cookie: a.ownerCookie,
      body: { name: "Karim", phone: "+8801812345678", role_ids: [a.roleIds.Accountant], temporary_password: "TempPass12" },
    }));
    expect(res.status).toBe(201);
    expect((await res.json()).user.phone).toBe("01812345678");

    const signedIn = await signIn("inst-a", "01812345678", "TempPass12");
    expect(signedIn.status).toBe(200);
    const [created] = await testDb.select().from(users).where(eq(users.phone, "01812345678"));
    expect(created.mustChangePassword).toBe(true);

    const dup = await h.createUser(req("inst-a", "POST", "/api/v1/users", {
      cookie: a.ownerCookie,
      body: { name: "Other", phone: "01812345678", role_ids: [a.roleIds.Accountant], temporary_password: "TempPass12" },
    }));
    expect((await dup.json()).error.code).toBe("CONFLICT_USER_PHONE");
  });

  it("refuses to grant more access than the granter has", async () => {
    const a = await institute("inst-a");
    // A custom role that may manage users, but holds nothing else.
    const [custom] = await testDb.insert(roles).values({ tenantId: a.tenant.id, name: "User clerk" }).returning();
    const perms = await testDb.select().from(permissions);
    const pick = (n: string) => perms.find((p) => p.name === n)!.id;
    await testDb.insert(rolePermissions).values(["users.view", "users.manage"].map((n) => ({ tenantId: a.tenant.id, roleId: custom.id, permissionId: pick(n) })));
    const clerk = await a.withRole(custom.id, "clerk@a.test");

    const res = await h.createUser(req("inst-a", "POST", "/api/v1/users", {
      cookie: clerk.cookie,
      body: { name: "Sneaky", email: "sneaky@a.test", role_ids: [a.roleIds.Admin], temporary_password: "TempPass12" },
    }));
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe("PERM_ESCALATION");
    expect(await testDb.select().from(users).where(eq(users.email, "sneaky@a.test"))).toHaveLength(0); // nothing half-created
  });

  it("changes roles, disables and re-enables a user, and resets a password", async () => {
    const a = await institute("inst-a");
    const staff = await a.withRole(a.roleIds.Accountant, "staff@a.test");
    const id = staff.user.id;

    expect((await h.setRoles(req("inst-a", "PUT", `/api/v1/users/${id}/roles`, { cookie: a.ownerCookie, body: { role_ids: [a.roleIds.Admin] } }), { id })).status).toBe(204);
    const listed = await (await h.listUsers(req("inst-a", "GET", "/api/v1/users", { cookie: a.ownerCookie }))).json();
    expect(listed.items.find((u: { id: string }) => u.id === id).roles).toEqual([{ id: a.roleIds.Admin, name: "Admin" }]);

    const disabled = await h.setStatus(req("inst-a", "PATCH", `/api/v1/users/${id}/status`, { cookie: a.ownerCookie, body: { disabled: true } }), { id });
    expect((await disabled.json()).banned).toBe(true);
    expect((await signIn("inst-a", "staff@a.test", "SomePass1")).status).toBe(401);
    await h.setStatus(req("inst-a", "PATCH", `/api/v1/users/${id}/status`, { cookie: a.ownerCookie, body: { disabled: false } }), { id });

    const reset = await h.resetPassword(req("inst-a", "POST", `/api/v1/users/${id}/reset-password`, { cookie: a.ownerCookie, body: { temporary_password: "NewTemp123" } }), { id });
    expect(reset.status).toBe(200);
    expect((await signIn("inst-a", "staff@a.test", "NewTemp123")).status).toBe(200);
  });

  it("protects the Owner and refuses to disable yourself", async () => {
    const a = await institute("inst-a");
    const admin = await a.withRole(a.roleIds.Admin, "admin@a.test");
    const ownerId = a.owner.id;
    const disableOwner = await h.setStatus(req("inst-a", "PATCH", `/api/v1/users/${ownerId}/status`, { cookie: admin.cookie, body: { disabled: true } }), { id: ownerId });
    expect((await disableOwner.json()).error.code).toBe("CONFLICT_OWNER_PROTECTED");
    const resetOwner = await h.resetPassword(req("inst-a", "POST", `/api/v1/users/${ownerId}/reset-password`, { cookie: admin.cookie, body: { temporary_password: "NewTemp123" } }), { id: ownerId });
    expect((await resetOwner.json()).error.code).toBe("CONFLICT_OWNER_PROTECTED");
    const self = await h.setStatus(req("inst-a", "PATCH", `/api/v1/users/${admin.user.id}/status`, { cookie: admin.cookie, body: { disabled: true } }), { id: admin.user.id });
    expect((await self.json()).error.code).toBe("CONFLICT_SELF_DISABLE");
  });

  it("returns 404 for another institute's user and never changes them", async () => {
    const a = await institute("inst-a");
    const b = await institute("inst-b");
    const bUser = await b.withRole(b.roleIds.Accountant, "acc@b.test");
    const id = bUser.user.id;
    expect((await h.setStatus(req("inst-a", "PATCH", `/api/v1/users/${id}/status`, { cookie: a.ownerCookie, body: { disabled: true } }), { id })).status).toBe(404);
    expect((await h.resetPassword(req("inst-a", "POST", `/api/v1/users/${id}/reset-password`, { cookie: a.ownerCookie, body: { temporary_password: "NewTemp123" } }), { id })).status).toBe(404);
    expect((await h.setRoles(req("inst-a", "PUT", `/api/v1/users/${id}/roles`, { cookie: a.ownerCookie, body: { role_ids: [a.roleIds.Admin] } }), { id })).status).toBe(404);
    const [unchanged] = await testDb.select().from(users).where(eq(users.id, id));
    expect(unchanged.banned).toBe(false);
  });
});
