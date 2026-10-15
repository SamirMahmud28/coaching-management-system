import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "../../core/testing/db";
import { tenants, userRoles } from "../../core/db/schema";
import type { Db } from "../../core/db/types";
import { seedPlatformCatalog } from "../../core/db/seed";
import { LocalDiskStorage } from "../../core/files/storage";
import { createLogin } from "../auth/credentials";
import { createTenantAuth } from "../auth/tenant-auth";
import { seedBaselineRoles } from "../rbac/service";
import { createFilesHandlers } from "./http";

const { db: testDb, reset, close } = createTestDb();
const db = testDb as unknown as Db;
const host = { baseDomain: "localhost:3000", platformHost: "admin.localhost:3000" };
const auth = createTenantAuth(db, { secret: "test-secret-".padEnd(40, "x"), host, protocol: "http" });
let h: ReturnType<typeof createFilesHandlers>;

beforeEach(async () => {
  await reset();
  await seedPlatformCatalog(testDb);
  h = createFilesHandlers({ db, auth, host, storage: new LocalDiskStorage(await mkdtemp(path.join(os.tmpdir(), "sms-files-http-"))) });
});
afterAll(async () => {
  await close();
});

const HOST_OF = (subdomain: string) => `${subdomain}.localhost:3000`;

function req(subdomain: string, method: string, pathname: string, opts: { cookie?: string; body?: BodyInit; headers?: Record<string, string> } = {}) {
  const host = HOST_OF(subdomain);
  return new Request(`http://${host}${pathname}`, {
    method,
    headers: { host, origin: `http://${host}`, ...(opts.cookie ? { cookie: opts.cookie } : {}), ...opts.headers },
    body: opts.body,
  });
}

async function institute(subdomain: string) {
  const [tenant] = await testDb.insert(tenants).values({ name: subdomain, subdomain, status: "ACTIVE" }).returning();
  const roleIds = await seedBaselineRoles(db, tenant.id);
  const login = async (role: string, identifier: string, username = false) => {
    const user = await createLogin(db, { tenantId: tenant.id, name: role, ...(username ? { username: identifier } : { email: identifier }), password: "SomePass1" });
    await testDb.insert(userRoles).values({ tenantId: tenant.id, userId: user.id, roleId: roleIds[role] });
    const res = await auth.handler(
      new Request(`http://${HOST_OF(subdomain)}/api/auth/tenant/sign-in`, {
        method: "POST",
        headers: { host: HOST_OF(subdomain), origin: `http://${HOST_OF(subdomain)}`, "content-type": "application/json" },
        body: JSON.stringify({ identifier, password: "SomePass1" }),
      }),
    );
    return { user, cookie: res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ") };
  };
  return { tenant, login };
}

async function form(category: string, bytes?: Buffer, name = "photo.jpg") {
  const fd = new FormData();
  fd.set("category", category);
  const data = bytes ?? (await sharp({ create: { width: 300, height: 400, channels: 3, background: "#123456" } }).jpeg().toBuffer());
  fd.set("file", new File([new Uint8Array(data)], name, { type: "image/jpeg" }));
  return fd;
}

describe("files API", () => {
  it("requires a session to upload or read", async () => {
    await institute("inst-a");
    expect((await h.upload(req("inst-a", "POST", "/api/v1/files", { body: await form("STUDENT_PHOTO") }))).status).toBe(401);
    const id = crypto.randomUUID();
    expect((await h.serve(req("inst-a", "GET", `/api/v1/files/${id}`), { id })).status).toBe(401);
  });

  it("uploads a photo and serves the processed bytes with safe, private headers", async () => {
    const { login } = await institute("inst-a");
    const admin = await login("Admin", "admin@a.test");

    const res = await h.upload(req("inst-a", "POST", "/api/v1/files", { cookie: admin.cookie, body: await form("STUDENT_PHOTO") }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toMatchObject({ category: "STUDENT_PHOTO", mime_type: "image/jpeg", filename: "photo.jpg" });

    const served = await h.serve(req("inst-a", "GET", `/api/v1/files/${body.id}`, { cookie: admin.cookie }), { id: body.id });
    expect(served.status).toBe(200);
    expect(served.headers.get("content-type")).toBe("image/jpeg");
    expect(served.headers.get("cache-control")).toContain("private");
    expect(served.headers.get("x-content-type-options")).toBe("nosniff");
    const meta = await sharp(Buffer.from(await served.arrayBuffer())).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(["jpeg", 300, 400]);
  });

  it("refuses uploads by role and category, and bad input", async () => {
    const { login } = await institute("inst-a");
    const instructor = await login("Instructor", "instructor@a.test");
    const accountant = await login("Accountant", "accountant@a.test");
    const admin = await login("Admin", "admin@a.test");
    const status = async (cookie: string, body: FormData) => {
      const res = await h.upload(req("inst-a", "POST", "/api/v1/files", { cookie, body }));
      return { status: res.status, code: (await res.json()).error?.code };
    };

    // Instructors can't upload student photos; an Accountant can't change the logo.
    expect((await status(instructor.cookie, await form("STUDENT_PHOTO"))).status).toBe(403);
    expect((await status(accountant.cookie, await form("LOGO"))).status).toBe(403);
    expect((await status(admin.cookie, await form("LOGO"))).status).toBe(201);
    expect(await status(admin.cookie, await form("PASSPORT"))).toEqual({ status: 422, code: "VALIDATION_FILE_CATEGORY" });
    expect(await status(admin.cookie, await form("STUDENT_PHOTO", Buffer.from("definitely not a jpeg")))).toEqual({ status: 422, code: "VALIDATION_FILE_TYPE" });

    const tooBig = await h.upload(req("inst-a", "POST", "/api/v1/files", { cookie: admin.cookie, body: await form("STUDENT_PHOTO"), headers: { "content-length": String(6 * 1024 * 1024) } }));
    expect(tooBig.status).toBe(422);
  });

  it("never serves another institute's file, and hides student photos from students", async () => {
    const a = await institute("inst-a");
    const b = await institute("inst-b");
    const adminA = await a.login("Admin", "admin@a.test");
    const adminB = await b.login("Admin", "admin@b.test");
    const uploaded = await (await h.upload(req("inst-a", "POST", "/api/v1/files", { cookie: adminA.cookie, body: await form("STUDENT_PHOTO") }))).json();

    // Another institute, even with the exact id.
    expect((await h.serve(req("inst-b", "GET", `/api/v1/files/${uploaded.id}`, { cookie: adminB.cookie }), { id: uploaded.id })).status).toBe(404);

    // A student can't see another student's photo (their own photo is added with the student records).
    const student = await a.login("Student", "STU-000002", true);
    expect((await h.serve(req("inst-a", "GET", `/api/v1/files/${uploaded.id}`, { cookie: student.cookie }), { id: uploaded.id })).status).toBe(404);
  });
});
