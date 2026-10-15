import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "../../core/testing/db";
import { instructors, permissions, rolePermissions, roles, tenants, userRoles, users } from "../../core/db/schema";
import type { Db } from "../../core/db/types";
import { seedPlatformCatalog } from "../../core/db/seed";
import { canViewFile, uploadFile } from "../../core/files/service";
import { LocalDiskStorage } from "../../core/files/storage";
import { INSTITUTE_OWNER_ROLE } from "../../core/rbac/catalog";
import { resolvePortal } from "../../core/rbac/portal";
import { createLogin } from "../auth/credentials";
import { createTenantAuth } from "../auth/tenant-auth";
import { getActivePermissions } from "../authorization/service";
import { seedBaselineRoles } from "../rbac/service";
import { createInstructorHandlers } from "./http";

const { db: testDb, reset, close } = createTestDb();
const db = testDb as unknown as Db;
const host = { baseDomain: "localhost:3000", platformHost: "admin.localhost:3000" };
const auth = createTenantAuth(db, { secret: "test-secret-".padEnd(40, "x"), host, protocol: "http" });
const h = createInstructorHandlers({ db, auth, host });

beforeEach(async () => {
  await reset();
  await seedPlatformCatalog(testDb);
});
afterAll(async () => {
  await close();
});

const HOST = (sub: string) => `${sub}.localhost:3000`;
function req(sub: string, method: string, p: string, opts: { body?: unknown; cookie?: string } = {}) {
  return new Request(`http://${HOST(sub)}${p}`, {
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

async function institute(sub: string) {
  const [tenant] = await testDb.insert(tenants).values({ name: sub, subdomain: sub, status: "ACTIVE" }).returning();
  const roleIds = await seedBaselineRoles(db, tenant.id);
  const owner = await createLogin(db, { tenantId: tenant.id, name: "Owner", email: `owner@${sub}.test`, password: "OwnerPass1", mustChangePassword: false });
  await testDb.insert(userRoles).values({ tenantId: tenant.id, userId: owner.id, roleId: roleIds[INSTITUTE_OWNER_ROLE] });
  await testDb.update(tenants).set({ ownerUserId: owner.id }).where(eq(tenants.id, tenant.id));
  const withRole = async (roleId: string, email: string) => {
    const user = await createLogin(db, { tenantId: tenant.id, name: email, email, password: "SomePass1", mustChangePassword: false });
    await testDb.insert(userRoles).values({ tenantId: tenant.id, userId: user.id, roleId });
    return { user, cookie: (await signIn(sub, email, "SomePass1")).cookie };
  };
  return { tenant, roleIds, owner, ownerCookie: (await signIn(sub, `owner@${sub}.test`, "OwnerPass1")).cookie, withRole };
}

const newInstructor = { full_name: "Mahbub Alam", phone: "+880 1911-223344", gender: "MALE", temporary_password: "TeachPass1" };

async function create(sub: string, cookie: string, body: object = newInstructor) {
  const res = await h.create(req(sub, "POST", "/api/v1/instructors", { cookie, body }));
  return { status: res.status, body: await res.json() };
}

describe("instructors API", () => {
  it("needs instructors.* permissions: the Accountant and instructors themselves can't manage instructors", async () => {
    const a = await institute("inst-a");
    const accountant = await a.withRole(a.roleIds.Accountant, "acc@a.test");
    const instructorUser = await a.withRole(a.roleIds.Instructor, "teach@a.test");
    for (const cookie of [accountant.cookie, instructorUser.cookie]) {
      expect((await h.list(req("inst-a", "GET", "/api/v1/instructors", { cookie }))).status).toBe(403);
      expect((await create("inst-a", cookie)).status).toBe(403);
    }
    expect((await h.list(req("inst-a", "GET", "/api/v1/instructors"))).status).toBe(401);
  });

  it("creates an instructor whose login signs in by mobile number into the instructor portal", async () => {
    const a = await institute("inst-a");
    const created = await create("inst-a", a.ownerCookie);
    expect(created.status).toBe(201);
    expect(created.body.instructor).toMatchObject({ full_name: "Mahbub Alam", phone: "01911223344", status: "ACTIVE", must_change_password: true });
    expect(created.body.temporary_password).toBe("TeachPass1");

    expect((await signIn("inst-a", "01911223344", "TeachPass1")).status).toBe(200);
    const { permissions } = await getActivePermissions(db, a.tenant.id, created.body.instructor.user_id);
    expect(resolvePortal(permissions)).toBe("instructor");
  });

  it("validates identifiers and refuses a mobile number someone else signs in with", async () => {
    const a = await institute("inst-a");
    expect((await create("inst-a", a.ownerCookie, { ...newInstructor, phone: "12345" })).body.error.code).toBe("VALIDATION_PHONE");
    expect((await create("inst-a", a.ownerCookie, { full_name: "X", temporary_password: "TeachPass1" })).body.error.code).toBe("VALIDATION_LOGIN_IDENTIFIER");
    await create("inst-a", a.ownerCookie);
    expect((await create("inst-a", a.ownerCookie, { ...newInstructor, full_name: "Other" })).body.error.code).toBe("CONFLICT_USER_PHONE");
    expect(await testDb.select().from(instructors)).toHaveLength(1); // nothing half-created
  });

  it("refuses to create an instructor login with access the creator doesn't hold", async () => {
    const a = await institute("inst-a");
    const [clerkRole] = await testDb.insert(roles).values({ tenantId: a.tenant.id, name: "HR clerk" }).returning();
    const perms = await testDb.select().from(permissions);
    await testDb.insert(rolePermissions).values(["instructors.view", "instructors.manage"].map((n) => ({ tenantId: a.tenant.id, roleId: clerkRole.id, permissionId: perms.find((p) => p.name === n)!.id })));
    const clerk = await a.withRole(clerkRole.id, "clerk@a.test");
    const res = await create("inst-a", clerk.cookie);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("PERM_ESCALATION"); // the clerk lacks batches.own.view
    expect(await testDb.select().from(instructors)).toHaveLength(0);
  });

  it("edits the profile and keeps the login's name, email and mobile number in step", async () => {
    const a = await institute("inst-a");
    const { body } = await create("inst-a", a.ownerCookie);
    const id = body.instructor.id;
    const res = await h.update(req("inst-a", "PATCH", `/api/v1/instructors/${id}`, { cookie: a.ownerCookie, body: { full_name: "Mahbub Alam Khan", email: "mahbub@a.test", phone: null } }), { id });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ full_name: "Mahbub Alam Khan", email: "mahbub@a.test", phone: null });
    const [user] = await testDb.select().from(users).where(eq(users.id, body.instructor.user_id));
    expect(user).toMatchObject({ name: "Mahbub Alam Khan", email: "mahbub@a.test", phone: null });
    expect((await signIn("inst-a", "mahbub@a.test", "TeachPass1")).status).toBe(200);

    const none = await h.update(req("inst-a", "PATCH", `/api/v1/instructors/${id}`, { cookie: a.ownerCookie, body: { email: null } }), { id });
    expect((await none.json()).error.code).toBe("VALIDATION_LOGIN_IDENTIFIER");
  });

  it("deactivating blocks sign-in and reactivating restores it; nothing is deleted", async () => {
    const a = await institute("inst-a");
    const { body } = await create("inst-a", a.ownerCookie);
    const id = body.instructor.id;
    const off = await h.setStatus(req("inst-a", "PATCH", `/api/v1/instructors/${id}/status`, { cookie: a.ownerCookie, body: { status: "INACTIVE" } }), { id });
    expect((await off.json()).status).toBe("INACTIVE");
    expect((await signIn("inst-a", "01911223344", "TeachPass1")).status).toBe(401);
    await h.setStatus(req("inst-a", "PATCH", `/api/v1/instructors/${id}/status`, { cookie: a.ownerCookie, body: { status: "ACTIVE" } }), { id });
    expect((await signIn("inst-a", "01911223344", "TeachPass1")).status).toBe(200);
  });

  it("resets the password to a new temporary one", async () => {
    const a = await institute("inst-a");
    const { body } = await create("inst-a", a.ownerCookie);
    const id = body.instructor.id;
    const res = await h.resetPassword(req("inst-a", "POST", `/api/v1/instructors/${id}/reset-password`, { cookie: a.ownerCookie, body: { temporary_password: "NewTeach12" } }), { id });
    expect(res.status).toBe(200);
    expect((await signIn("inst-a", "01911223344", "TeachPass1")).status).toBe(401);
    expect((await signIn("inst-a", "01911223344", "NewTeach12")).status).toBe(200);
  });

  it("lists with search and status filters", async () => {
    const a = await institute("inst-a");
    await create("inst-a", a.ownerCookie);
    const second = await create("inst-a", a.ownerCookie, { full_name: "Sadia Rahman", email: "sadia@a.test", temporary_password: "TeachPass1" });
    await h.setStatus(req("inst-a", "PATCH", `/api/v1/instructors/${second.body.instructor.id}/status`, { cookie: a.ownerCookie, body: { status: "INACTIVE" } }), { id: second.body.instructor.id });
    const list = async (query: string) => (await (await h.list(req("inst-a", "GET", `/api/v1/instructors${query}`, { cookie: a.ownerCookie }))).json()).items.map((i: { full_name: string }) => i.full_name);
    expect(await list("")).toEqual(["Mahbub Alam", "Sadia Rahman"]);
    expect(await list("?q=sadia")).toEqual(["Sadia Rahman"]);
    expect(await list("?q=01911")).toEqual(["Mahbub Alam"]);
    expect(await list("?status=ACTIVE")).toEqual(["Mahbub Alam"]);
  });

  it("returns 404 for another institute's instructor and never changes them", async () => {
    const a = await institute("inst-a");
    const b = await institute("inst-b");
    const { body } = await create("inst-b", b.ownerCookie);
    const id = body.instructor.id;
    expect((await h.get(req("inst-a", "GET", `/api/v1/instructors/${id}`, { cookie: a.ownerCookie }), { id })).status).toBe(404);
    expect((await h.update(req("inst-a", "PATCH", `/api/v1/instructors/${id}`, { cookie: a.ownerCookie, body: { full_name: "Hacked" } }), { id })).status).toBe(404);
    expect((await h.setStatus(req("inst-a", "PATCH", `/api/v1/instructors/${id}/status`, { cookie: a.ownerCookie, body: { status: "INACTIVE" } }), { id })).status).toBe(404);
    expect((await h.resetPassword(req("inst-a", "POST", `/api/v1/instructors/${id}/reset-password`, { cookie: a.ownerCookie, body: { temporary_password: "NewTeach12" } }), { id })).status).toBe(404);
    expect((await h.list(req("inst-a", "GET", "/api/v1/instructors", { cookie: a.ownerCookie }))).status).toBe(200);
    const [unchanged] = await testDb.select().from(instructors).where(eq(instructors.id, id));
    expect(unchanged).toMatchObject({ fullName: "Mahbub Alam", status: "ACTIVE" });
  });

  it("lets an instructor see their own photo but not another instructor's", async () => {
    const a = await institute("inst-a");
    const storage = new LocalDiskStorage(await mkdtemp(path.join(os.tmpdir(), "cms-instructors-")));
    const actor = { tenantId: a.tenant.id, userId: a.owner.id };
    const image = await sharp({ create: { width: 80, height: 100, channels: 3, background: "#224466" } }).jpeg().toBuffer();
    const photo = await uploadFile(db, storage, actor, { category: "INSTRUCTOR_PHOTO", filename: "p.jpg", bytes: image });
    const other = await uploadFile(db, storage, actor, { category: "INSTRUCTOR_PHOTO", filename: "o.jpg", bytes: image });
    const { body } = await create("inst-a", a.ownerCookie, { ...newInstructor, photo_file_id: photo.id });
    const viewer = { tenantId: a.tenant.id, userId: body.instructor.user_id, permissions: new Set<string>(["batches.own.view"]) };
    expect(await canViewFile(db, viewer, photo)).toBe(true);
    expect(await canViewFile(db, viewer, other)).toBe(false);
  });
});
