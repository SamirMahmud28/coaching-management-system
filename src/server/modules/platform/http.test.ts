import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "../../core/testing/db";
import { platformUsers, users } from "../../core/db/schema";
import type { Db } from "../../core/db/types";
import { seedPlatformCatalog } from "../../core/db/seed";
import { createPlatformAuth } from "../auth/platform-auth";
import { createPlatformLogin } from "../auth/platform-credentials";
import { createModuleRequest } from "../entitlements/service";
import { createPlatformHandlers } from "./http";

const { db: testDb, reset, close } = createTestDb();
const db = testDb as unknown as Db;
const HOST = "admin.localhost:3000";
const ORIGIN = `http://${HOST}`;
const auth = createPlatformAuth(db, { secret: "test-secret-".padEnd(40, "x"), platformHost: HOST, protocol: "http" });
const h = createPlatformHandlers({ db, auth, origin: ORIGIN });

beforeEach(async () => {
  await reset();
  await seedPlatformCatalog(testDb);
});

afterAll(async () => {
  await close();
});

function req(method: string, path: string, opts: { body?: unknown; cookie?: string; origin?: string } = {}) {
  return new Request(`${ORIGIN}/api/platform${path}`, {
    method,
    headers: {
      host: HOST,
      origin: opts.origin ?? ORIGIN,
      "content-type": "application/json",
      ...(opts.cookie ? { cookie: opts.cookie } : {}),
    },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
}

async function signedInAdmin(email = "root@platform.test", mustChangePassword = false) {
  const admin = await createPlatformLogin(db, { name: "Root", email, password: "RootPass123", mustChangePassword });
  const res = await auth.handler(
    new Request(`${ORIGIN}/api/platform/auth/login`, {
      method: "POST",
      headers: { host: HOST, origin: ORIGIN, "content-type": "application/json" },
      body: JSON.stringify({ email, password: "RootPass123" }),
    }),
  );
  const cookie = res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  return { admin, cookie };
}

const tenantBody = (subdomain: string) => ({
  name: "Green Valley Coaching",
  subdomain,
  starter_modules: ["fees", "exams"],
  owner_name: "Owner Person",
  owner_email: `owner@${subdomain}.test`,
  temporary_password: "OwnerPass123",
});

async function createTenantViaApi(cookie: string, subdomain = "green-valley") {
  const res = await h.createTenant(req("POST", "/tenants", { body: tenantBody(subdomain), cookie }));
  expect(res.status).toBe(201);
  return (await res.json()).tenant as { id: string; owner_user_id: string };
}

describe("platform route guard", () => {
  it("rejects a request with no session", async () => {
    const res = await h.listTenants(req("GET", "/tenants"));
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: { code: "AUTH_REQUIRED" } });
  });

  it("rejects an admin still on their temporary password", async () => {
    const { cookie } = await signedInAdmin("fresh@platform.test", true);
    const res = await h.listTenants(req("GET", "/tenants", { cookie }));
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: { code: "AUTH_PASSWORD_CHANGE_REQUIRED" } });
  });

  it("rejects a disabled admin's still-live cookie", async () => {
    const { admin, cookie } = await signedInAdmin();
    await testDb.update(platformUsers).set({ status: "DISABLED" }).where(eq(platformUsers.id, admin.id));
    expect((await h.listTenants(req("GET", "/tenants", { cookie }))).status).toBe(401);
  });

  it("rejects a write from another origin", async () => {
    const { cookie } = await signedInAdmin();
    const res = await h.createTenant(req("POST", "/tenants", { body: tenantBody("green-valley"), cookie, origin: "http://evil.example.com" }));
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: { code: "INVALID_ORIGIN" } });
  });
});

describe("tenants", () => {
  it("POST /tenants creates a tenant and returns the one-time password; a duplicate subdomain is 409", async () => {
    const { cookie } = await signedInAdmin();
    const res = await h.createTenant(req("POST", "/tenants", { body: tenantBody("green-valley"), cookie }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.temporary_password).toBe("OwnerPass123");
    expect(body.tenant.status).toBe("ACTIVE");

    const dup = await h.createTenant(req("POST", "/tenants", { body: tenantBody("green-valley"), cookie }));
    expect(dup.status).toBe(409);
    expect(await dup.json()).toMatchObject({ error: { code: "CONFLICT_TENANT_SUBDOMAIN" } });
  });

  it("POST /tenants rejects a malformed body", async () => {
    const { cookie } = await signedInAdmin();
    const res = await h.createTenant(req("POST", "/tenants", { body: { name: "x" }, cookie }));
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ error: { code: "VALIDATION_REQUEST" } });
  });

  it("GET /tenants lists with snake_case keys; a bad status filter is 422", async () => {
    const { cookie } = await signedInAdmin();
    await createTenantViaApi(cookie);
    const res = await h.listTenants(req("GET", "/tenants?status=ACTIVE&page_size=10", { cookie }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.total).toBe(1);
    expect(body.page_size).toBe(10);
    expect(body.items[0].module_count).toBe(3);

    expect((await h.listTenants(req("GET", "/tenants?status=NOPE", { cookie }))).status).toBe(422);
  });

  it("GET /tenants/check-subdomain reports available, taken and invalid", async () => {
    const { cookie } = await signedInAdmin();
    await createTenantViaApi(cookie);
    const check = async (s: string) => (await h.checkSubdomain(req("GET", `/tenants/check-subdomain?subdomain=${s}`, { cookie }))).json();
    expect(await check("new-inst")).toEqual({ available: true, reason: null });
    expect(await check("green-valley")).toEqual({ available: false, reason: "taken" });
    expect(await check("admin")).toEqual({ available: false, reason: "invalid" });
  });

  it("GET /tenants/:id returns the Owner and module states; malformed and unknown ids are 404", async () => {
    const { cookie } = await signedInAdmin();
    const tenant = await createTenantViaApi(cookie);
    const res = await h.getTenant(req("GET", `/tenants/${tenant.id}`, { cookie }), { id: tenant.id });
    const body = await res.json();
    expect(body.owner.email).toBe("owner@green-valley.test");
    expect(body.modules.find((m: { key: string }) => m.key === "core")).toMatchObject({ enabled: true, always_on: true });
    expect(body.paid_until).toBeNull();
    expect(body.modules.find((m: { key: string }) => m.key === "attendance")).toMatchObject({ enabled: false });

    expect((await h.getTenant(req("GET", "/tenants/not-a-uuid", { cookie }), { id: "not-a-uuid" })).status).toBe(404);
    const unknown = "00000000-0000-0000-0000-000000000000";
    expect((await h.getTenant(req("GET", `/tenants/${unknown}`, { cookie }), { id: unknown })).status).toBe(404);
  });

  it("PATCH /tenants/:id/status suspends with a reason; without one is 422", async () => {
    const { cookie } = await signedInAdmin();
    const tenant = await createTenantViaApi(cookie);
    const ok = await h.setTenantStatus(req("PATCH", `/tenants/${tenant.id}/status`, { body: { status: "SUSPENDED", reason: "Overdue" }, cookie }), { id: tenant.id });
    expect(ok.status).toBe(200);
    expect((await ok.json()).suspended_reason).toBe("Overdue");

    const bad = await h.setTenantStatus(req("PATCH", `/tenants/${tenant.id}/status`, { body: { status: "DEACTIVATED" }, cookie }), { id: tenant.id });
    expect(bad.status).toBe(422);
    expect(await bad.json()).toMatchObject({ error: { code: "VALIDATION_REASON_REQUIRED" } });
  });

  it("PATCH /tenants/:id/modules applies and audits a change; Core can't be switched off (409)", async () => {
    const { cookie } = await signedInAdmin();
    const tenant = await createTenantViaApi(cookie);
    const ok = await h.setTenantModules(
      req("PATCH", `/tenants/${tenant.id}/modules`, { body: { changes: [{ module_key: "attendance", enabled: true }] }, cookie }),
      { id: tenant.id },
    );
    expect(ok.status).toBe(200);
    expect((await ok.json()).modules.find((m: { key: string }) => m.key === "attendance").enabled).toBe(true);

    const audit = await (await h.auditLog(req("GET", "/audit-log?action=MODULE_ENTITLEMENT_CHANGED", { cookie }))).json();
    expect(audit.total).toBe(1);
    expect(audit.items[0].new_value).toEqual({ module: "attendance", enabled: true });

    const bad = await h.setTenantModules(
      req("PATCH", `/tenants/${tenant.id}/modules`, { body: { changes: [{ module_key: "core", enabled: false }] }, cookie }),
      { id: tenant.id },
    );
    expect(bad.status).toBe(409);
    expect(await bad.json()).toMatchObject({ error: { code: "CONFLICT_MODULE_ALWAYS_ON" } });
  });

  it("PATCH /tenants/:id/paid-until sets and clears the display-only date; a malformed date is 422", async () => {
    const { cookie } = await signedInAdmin();
    const tenant = await createTenantViaApi(cookie);
    const call = (paid_until: string | null) =>
      h.setTenantPaidUntil(req("PATCH", `/tenants/${tenant.id}/paid-until`, { body: { paid_until }, cookie }), { id: tenant.id });
    expect((await (await call("2027-01-31")).json()).paid_until).toBe("2027-01-31");
    expect((await (await call(null)).json()).paid_until).toBeNull();
    expect((await call("31/01/2027")).status).toBe(422);
  });

  it("POST /tenants/:id/transfer-ownership moves the Owner; another tenant's user is 404", async () => {
    const { cookie } = await signedInAdmin();
    const a = await createTenantViaApi(cookie, "inst-a");
    const b = await createTenantViaApi(cookie, "inst-b");
    const [newOwner] = await testDb.insert(users).values({ tenantId: a.id, name: "New Owner", username: "new-owner" }).returning();

    const ok = await h.transferOwnership(req("POST", `/tenants/${a.id}/transfer-ownership`, { body: { new_owner_user_id: newOwner.id }, cookie }), { id: a.id });
    expect((await ok.json()).owner_user_id).toBe(newOwner.id);

    const bad = await h.transferOwnership(req("POST", `/tenants/${a.id}/transfer-ownership`, { body: { new_owner_user_id: b.owner_user_id }, cookie }), { id: a.id });
    expect(bad.status).toBe(404);
  });
});

describe("module requests", () => {
  it("lists the queue with tenant/module names and dismisses with a note; a blank note is 422", async () => {
    const { cookie } = await signedInAdmin();
    const tenant = await createTenantViaApi(cookie);
    const request = await createModuleRequest(db, { tenantId: tenant.id, moduleKey: "exams", requestedBy: tenant.owner_user_id, note: "We need exams" });

    const queue = await (await h.listModuleRequests(req("GET", "/module-requests", { cookie }))).json();
    expect(queue.items).toHaveLength(1);
    expect(queue.items[0]).toMatchObject({ tenant_subdomain: "green-valley", module_key: "exams", note: "We need exams" });

    const blank = await h.dismissModuleRequest(req("POST", `/module-requests/${request.id}/dismiss`, { body: { note: "" }, cookie }), { id: request.id });
    expect(blank.status).toBe(422);

    const ok = await h.dismissModuleRequest(req("POST", `/module-requests/${request.id}/dismiss`, { body: { note: "Not on your plan yet" }, cookie }), { id: request.id });
    expect((await ok.json()).status).toBe("DISMISSED");

    const audit = await (await h.auditLog(req("GET", `/audit-log?action=MODULE_REQUEST_DISMISSED&tenant_id=${tenant.id}`, { cookie }))).json();
    expect(audit.items[0].new_value).toEqual({ note: "Not on your plan yet" });
  });

  it("rejects a malformed tenant_id filter", async () => {
    const { cookie } = await signedInAdmin();
    expect((await h.listModuleRequests(req("GET", "/module-requests?tenant_id=nope", { cookie }))).status).toBe(422);
  });
});

describe("platform admins", () => {
  it("lists admins without exposing any credential; creates one (201); a duplicate email is 409", async () => {
    const { cookie } = await signedInAdmin();
    const created = await h.createAdmin(req("POST", "/admins", { body: { name: "Second", email: "second@platform.test", temporary_password: "Second123" }, cookie }));
    expect(created.status).toBe(201);
    expect((await created.json()).must_change_password).toBe(true);

    const list = await (await h.listAdmins(req("GET", "/admins", { cookie }))).json();
    expect(list.items).toHaveLength(2);
    expect(JSON.stringify(list)).not.toMatch(/password"?:\s*"/i);

    const dup = await h.createAdmin(req("POST", "/admins", { body: { name: "Dup", email: "SECOND@platform.test", temporary_password: "Second123" }, cookie }));
    expect(dup.status).toBe(409);
  });

  it("disables and re-enables another admin; disabling yourself is 409", async () => {
    const { admin, cookie } = await signedInAdmin();
    const other = await createPlatformLogin(db, { name: "Other", email: "other@platform.test", password: "Other12345" });

    const disabled = await h.setAdminStatus(req("PATCH", `/admins/${other.id}/status`, { body: { status: "DISABLED" }, cookie }), { id: other.id });
    expect((await disabled.json()).status).toBe("DISABLED");
    const enabled = await h.setAdminStatus(req("PATCH", `/admins/${other.id}/status`, { body: { status: "ACTIVE" }, cookie }), { id: other.id });
    expect((await enabled.json()).status).toBe("ACTIVE");

    const self = await h.setAdminStatus(req("PATCH", `/admins/${admin.id}/status`, { body: { status: "DISABLED" }, cookie }), { id: admin.id });
    expect(self.status).toBe(409);
    expect(await self.json()).toMatchObject({ error: { code: "CONFLICT_SELF_DISABLE" } });
  });
});

describe("pickers", () => {
  it("GET /tenants/:id/users lists that tenant's users only, with no credential fields; unknown tenant is 404", async () => {
    const { cookie } = await signedInAdmin();
    const a = await createTenantViaApi(cookie, "inst-a");
    await createTenantViaApi(cookie, "inst-b");
    const res = await h.listTenantUsers(req("GET", `/tenants/${a.id}/users`, { cookie }), { id: a.id });
    const body = await res.json();
    expect(body.items).toHaveLength(1);
    expect(body.items[0]).toMatchObject({ id: a.owner_user_id, email: "owner@inst-a.test" });
    expect(Object.keys(body.items[0])).not.toContain("password");

    const unknown = "00000000-0000-0000-0000-000000000000";
    expect((await h.listTenantUsers(req("GET", `/tenants/${unknown}/users`, { cookie }), { id: unknown })).status).toBe(404);
  });

  it("names the requester in the module-request queue", async () => {
    const { cookie } = await signedInAdmin();
    const tenant = await createTenantViaApi(cookie);
    await createModuleRequest(db, { tenantId: tenant.id, moduleKey: "exams", requestedBy: tenant.owner_user_id });
    const queue = await (await h.listModuleRequests(req("GET", "/module-requests", { cookie }))).json();
    expect(queue.items[0].requested_by_name).toBe("Owner Person");
  });
});

describe("audit log", () => {
  it("resolves actor and tenant names", async () => {
    const { cookie } = await signedInAdmin();
    await createTenantViaApi(cookie);
    const audit = await (await h.auditLog(req("GET", "/audit-log?action=TENANT_CREATED", { cookie }))).json();
    expect(audit.items[0]).toMatchObject({ actor_name: "Root", tenant_name: "Green Valley Coaching" });
  });

  it("shows platform actions; a bad actor_type filter is 422", async () => {
    const { cookie } = await signedInAdmin();
    await createTenantViaApi(cookie);
    const audit = await (await h.auditLog(req("GET", "/audit-log?actor_type=PLATFORM_USER", { cookie }))).json();
    expect(audit.items.map((i: { action: string }) => i.action)).toContain("TENANT_CREATED");

    expect((await h.auditLog(req("GET", "/audit-log?actor_type=ROBOT", { cookie }))).status).toBe(422);
  });
});
