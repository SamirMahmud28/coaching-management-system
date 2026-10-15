import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "../../core/testing/db";
import { tenants, userRoles } from "../../core/db/schema";
import type { Db } from "../../core/db/types";
import { seedPlatformCatalog } from "../../core/db/seed";
import { createLogin } from "../auth/credentials";
import { createTenantAuth } from "../auth/tenant-auth";
import { seedBaselineRoles } from "../rbac/service";
import { createSettingsHandlers } from "./http";
import { createSignature } from "./service";

const { db: testDb, reset, close } = createTestDb();
const db = testDb as unknown as Db;
const host = { baseDomain: "localhost:3000", platformHost: "admin.localhost:3000" };
const auth = createTenantAuth(db, { secret: "test-secret-".padEnd(40, "x"), host, protocol: "http" });
const h = createSettingsHandlers({ db, auth, host });

beforeEach(async () => {
  await reset();
  await seedPlatformCatalog(testDb);
});
afterAll(async () => {
  await close();
});

const HOST = (sub: string) => `${sub}.localhost:3000`;
function req(sub: string, method: string, pathname: string, opts: { cookie?: string; body?: unknown } = {}) {
  return new Request(`http://${HOST(sub)}${pathname}`, {
    method,
    headers: { host: HOST(sub), origin: `http://${HOST(sub)}`, "content-type": "application/json", ...(opts.cookie ? { cookie: opts.cookie } : {}) },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
}

async function school(sub: string) {
  const [tenant] = await testDb.insert(tenants).values({ name: `School ${sub}`, subdomain: sub, status: "ACTIVE" }).returning();
  const roleIds = await seedBaselineRoles(db, tenant.id);
  const login = async (role: string) => {
    const email = `${role.replace(/\s+/g, "").toLowerCase()}@${sub}.test`;
    const user = await createLogin(db, { tenantId: tenant.id, name: role, email, password: "SomePass1" });
    await testDb.insert(userRoles).values({ tenantId: tenant.id, userId: user.id, roleId: roleIds[role] });
    const res = await auth.handler(
      new Request(`http://${HOST(sub)}/api/auth/tenant/sign-in`, {
        method: "POST",
        headers: { host: HOST(sub), origin: `http://${HOST(sub)}`, "content-type": "application/json" },
        body: JSON.stringify({ identifier: email, password: "SomePass1" }),
      }),
    );
    return { user, cookie: res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ") };
  };
  return { tenant, login };
}

const profileBody = { display_name: "Green Valley High School", short_name: "GVHS", primary_color: "#1f6feb" };

describe("settings API", () => {
  it("requires a session", async () => {
    await school("inst-a");
    expect((await h.getProfile(req("inst-a", "GET", "/api/v1/settings/institution"))).status).toBe(401);
    expect((await h.saveProfile(req("inst-a", "PUT", "/api/v1/settings/institution", { body: profileBody }))).status).toBe(401);
  });

  it("lets anyone in the school read the profile, but only settings managers change it or see signatories", async () => {
    const s = await school("inst-a");
    const instructor = await s.login("Instructor");
    const accountant = await s.login("Accountant");
    const admin = await s.login("Admin");

    const read = await h.getProfile(req("inst-a", "GET", "/api/v1/settings/institution", { cookie: instructor.cookie }));
    expect(read.status).toBe(200);
    expect(await read.json()).toMatchObject({ display_name: "School inst-a", is_default: true });

    for (const who of [instructor, accountant]) {
      expect((await h.saveProfile(req("inst-a", "PUT", "/api/v1/settings/institution", { cookie: who.cookie, body: profileBody }))).status).toBe(403);
      expect((await h.listSignatures(req("inst-a", "GET", "/api/v1/settings/signatures", { cookie: who.cookie }))).status).toBe(403);
    }

    const saved = await h.saveProfile(req("inst-a", "PUT", "/api/v1/settings/institution", { cookie: admin.cookie, body: profileBody }));
    expect(saved.status).toBe(200);
    expect(await saved.json()).toMatchObject({ display_name: "Green Valley High School", short_name: "GVHS", is_default: false });

    const bad = await h.saveProfile(req("inst-a", "PUT", "/api/v1/settings/institution", { cookie: admin.cookie, body: { ...profileBody, email: "nope" } }));
    expect(bad.status).toBe(422);
    expect((await bad.json()).error).toMatchObject({ code: "VALIDATION_EMAIL", details: { field: "email" } });
  });

  it("reads and saves the student ID pattern for settings managers only", async () => {
    const s = await school("inst-a");
    const accountant = await s.login("Accountant");
    const admin = await s.login("Admin");
    const body = { prefix: "KC", include_course_code: false, separator: "-", sequence_width: 4 };
    expect((await h.getStudentIdPattern(req("inst-a", "GET", "/api/v1/settings/student-id", { cookie: accountant.cookie }))).status).toBe(403);

    const saved = await h.saveStudentIdPattern(req("inst-a", "PUT", "/api/v1/settings/student-id", { cookie: admin.cookie, body }));
    expect(saved.status).toBe(200);
    expect(await saved.json()).toMatchObject({ prefix: "KC", sequence_width: 4, example: `KC-${new Date().getFullYear()}-0001` });

    const bad = await h.saveStudentIdPattern(req("inst-a", "PUT", "/api/v1/settings/student-id", { cookie: admin.cookie, body: { ...body, prefix: "1x" } }));
    expect((await bad.json()).error.code).toBe("VALIDATION_STUDENT_ID_PATTERN");
  });

  it("manages signatories, and can't touch another school's", async () => {
    const a = await school("inst-a");
    const b = await school("inst-b");
    const admin = await a.login("Admin");
    const bOwner = await b.login("Admin");

    const created = await h.createSignature(req("inst-a", "POST", "/api/v1/settings/signatures", { cookie: admin.cookie, body: { title: "Principal", person_name: "Dr. Rahman" } }));
    expect(created.status).toBe(201);
    const { id } = await created.json();
    const dup = await h.createSignature(req("inst-a", "POST", "/api/v1/settings/signatures", { cookie: admin.cookie, body: { title: "principal", person_name: "Other" } }));
    expect(dup.status).toBe(409);

    const patched = await h.updateSignature(req("inst-a", "PATCH", `/api/v1/settings/signatures/${id}`, { cookie: admin.cookie, body: { person_name: "Dr. M. Rahman" } }), { id });
    expect((await patched.json()).person_name).toBe("Dr. M. Rahman");

    const theirs = await createSignature(db, { tenantId: b.tenant.id, userId: bOwner.user.id }, { title: "Principal", personName: "B" });
    expect((await h.deleteSignature(req("inst-a", "DELETE", `/api/v1/settings/signatures/${theirs.id}`, { cookie: admin.cookie }), { id: theirs.id })).status).toBe(404);
    expect((await h.deleteSignature(req("inst-a", "DELETE", `/api/v1/settings/signatures/${id}`, { cookie: admin.cookie }), { id })).status).toBe(204);
  });
});
