import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "../../core/testing/db";
import { setModules } from "../../core/testing/modules";
import { auditLogs, enquiries, tenants, userRoles } from "../../core/db/schema";
import type { Db } from "../../core/db/types";
import { seedPlatformCatalog } from "../../core/db/seed";
import { LocalDiskStorage } from "../../core/files/storage";
import { INSTITUTE_OWNER_ROLE } from "../../core/rbac/catalog";
import * as academic from "../academic/service";
import { createLogin } from "../auth/credentials";
import { createTenantAuth } from "../auth/tenant-auth";
import { seedBaselineRoles } from "../rbac/service";
import * as students from "../students/service";
import { convertEnquiry, getEnquiry, listEnquiries, MAX_ENQUIRIES_PER_IP_PER_HOUR, MIN_FILL_MS, submitEnquiry, updateEnquiry } from "./enquiries";
import { createWebsiteHandlers } from "./http";

const { db: testDb, reset, close } = createTestDb();
const db = testDb as unknown as Db;
const host = { baseDomain: "localhost:3000", platformHost: "admin.localhost:3000" };
const auth = createTenantAuth(db, { secret: "test-secret-".padEnd(40, "x"), host, protocol: "http" });

beforeEach(async () => {
  await reset();
  await seedPlatformCatalog(testDb);
});
afterAll(async () => {
  await close();
});

let counter = 0;
async function institute(status: "ACTIVE" | "SUSPENDED" | "DEACTIVATED" = "ACTIVE") {
  const subdomain = `enq-${++counter}`;
  const [tenant] = await testDb.insert(tenants).values({ name: `Enq ${counter}`, subdomain, status }).returning();
  const roleIds = await seedBaselineRoles(db, tenant.id);
  const owner = await createLogin(db, { tenantId: tenant.id, name: "Owner", email: `o@${subdomain}.test`, password: "OwnerPass1" });
  await testDb.insert(userRoles).values({ tenantId: tenant.id, userId: owner.id, roleId: roleIds[INSTITUTE_OWNER_ROLE] });
  const actor = { tenantId: tenant.id, userId: owner.id };
  const course = await academic.createCourse(db, actor, { name: "HSC Science", code: "HSC", dueDay: 10 });
  return { tenantId: tenant.id, subdomain, actor, course };
}

const ok = { name: "Anika Rahman", mobile: "+880 1712-345678" };
const meta = (ip: string | null = "203.0.113.5") => ({ ipAddress: ip });

describe("the public enquiry form", () => {
  it("stores a valid enquiry with a normalized mobile number and the chosen course", async () => {
    const s = await institute();
    expect(await submitEnquiry(db, s.tenantId, { ...ok, courseId: s.course.id, message: "  Evening batch?  " }, meta())).toEqual({ stored: true });
    const [row] = (await listEnquiries(db, s.tenantId)).items;
    expect(row).toMatchObject({ name: "Anika Rahman", mobile: "01712345678", courseName: "HSC Science", message: "Evening batch?", status: "NEW" });
  });

  it("drops likely spam while appearing to succeed: a filled honeypot or a too-quick submission", async () => {
    const s = await institute();
    const now = new Date();
    expect(await submitEnquiry(db, s.tenantId, { ...ok, website: "http://spam.example" }, meta())).toEqual({ stored: false });
    expect(await submitEnquiry(db, s.tenantId, { ...ok, startedAt: now.getTime() - MIN_FILL_MS + 500 }, { ...meta(), now })).toEqual({ stored: false });
    expect(await submitEnquiry(db, s.tenantId, { ...ok, startedAt: now.getTime() - MIN_FILL_MS - 500 }, { ...meta(), now })).toEqual({ stored: true });
    expect((await listEnquiries(db, s.tenantId)).items).toHaveLength(1);
  });

  it("limits each address to five enquiries an hour per institute", async () => {
    const s = await institute();
    const other = await institute();
    for (let i = 0; i < MAX_ENQUIRIES_PER_IP_PER_HOUR; i++) await submitEnquiry(db, s.tenantId, ok, meta());
    await expect(submitEnquiry(db, s.tenantId, ok, meta())).rejects.toMatchObject({ code: "RATE_LIMITED", status: 429 });
    expect(await submitEnquiry(db, s.tenantId, ok, meta("198.51.100.7"))).toEqual({ stored: true }); // another address
    expect(await submitEnquiry(db, other.tenantId, ok, meta())).toEqual({ stored: true }); // another institute
    const later = new Date(Date.now() + 61 * 60 * 1000);
    expect(await submitEnquiry(db, s.tenantId, ok, { ...meta(), now: later })).toEqual({ stored: true });
  });

  it.each([
    [{ name: " ", mobile: "01712345678" }, "VALIDATION_REQUIRED"],
    [{ name: "A", mobile: "12345" }, "VALIDATION_PHONE"],
    [{ name: "A", mobile: "01712345678", message: "x".repeat(1001) }, "VALIDATION_TEXT"],
  ])("refuses %o", async (input, code) => {
    const s = await institute();
    await expect(submitEnquiry(db, s.tenantId, input, meta())).rejects.toMatchObject({ code });
  });

  it("accepts only an active course of the same institute", async () => {
    const s = await institute();
    const other = await institute();
    await expect(submitEnquiry(db, s.tenantId, { ...ok, courseId: other.course.id }, meta())).rejects.toMatchObject({ code: "VALIDATION_COURSE" });
    await academic.setCourseStatus(db, s.actor, s.course.id, "ARCHIVED");
    await expect(submitEnquiry(db, s.tenantId, { ...ok, courseId: s.course.id }, meta())).rejects.toMatchObject({ code: "VALIDATION_COURSE" });
  });

  it("is open on the institute's own host only while the website is shown", async () => {
    const h = createWebsiteHandlers({ db, auth, host, storage: new LocalDiskStorage(await mkdtemp(path.join(os.tmpdir(), "cms-enq-"))) });
    const post = (subdomain: string, body: object, ip = "192.0.2.1") =>
      h.submitEnquiry(new Request(`http://${subdomain}.localhost:3000/api/public/enquiries`, { method: "POST", headers: { host: `${subdomain}.localhost:3000`, "content-type": "application/json", "x-forwarded-for": `${ip}, 10.0.0.1` }, body: JSON.stringify(body) }));
    const s = await institute();
    const suspended = await institute("SUSPENDED");
    const gone = await institute("DEACTIVATED");
    const body = { name: "Rafi", mobile: "01812345678", course_id: null };

    expect((await post(s.subdomain, body)).status).toBe(404); // module off
    for (const t of [s, suspended, gone]) await setModules(db, t.tenantId, ["website"]);
    expect((await post(s.subdomain, body)).status).toBe(201);
    expect((await post(suspended.subdomain, body)).status).toBe(201);
    expect((await post(gone.subdomain, body)).status).toBe(404);
    expect((await post(s.subdomain, { ...body, website: "bot" })).status).toBe(201); // dropped silently
    expect((await post(s.subdomain, { name: "Rafi", mobile: "nope" })).status).toBe(422);
    const [row] = await testDb.select().from(enquiries).where(eq(enquiries.tenantId, s.tenantId));
    expect(row.ipAddress).toBe("192.0.2.1"); // the first forwarded address
    expect((await listEnquiries(db, s.tenantId)).items).toHaveLength(1);
  });
});

describe("the enquiry inbox", () => {
  it("moves through New, Contacted and Closed with a note, and audits each status change", async () => {
    const s = await institute();
    await submitEnquiry(db, s.tenantId, ok, meta());
    const [e] = (await listEnquiries(db, s.tenantId)).items;
    expect((await updateEnquiry(db, s.actor, e.id, { status: "CONTACTED", note: "Called; visiting Saturday." })).note).toBe("Called; visiting Saturday.");
    expect((await updateEnquiry(db, s.actor, e.id, { status: "NEW" })).status).toBe("NEW");
    expect((await updateEnquiry(db, s.actor, e.id, { status: "CLOSED" })).status).toBe("CLOSED");
    expect((await updateEnquiry(db, s.actor, e.id, { status: "NEW" })).status).toBe("NEW"); // reopened
    expect((await updateEnquiry(db, s.actor, e.id, { note: "Only a note" })).status).toBe("NEW");
    await expect(updateEnquiry(db, s.actor, e.id, { status: "CONVERTED" })).rejects.toMatchObject({ code: "CONFLICT_ENQUIRY_STATUS" });
    const audits = await testDb.select().from(auditLogs).where(eq(auditLogs.action, "ENQUIRY_STATUS_CHANGED"));
    expect(audits.map((a) => (a.newValue as { status: string }).status)).toEqual(expect.arrayContaining(["CONTACTED", "NEW", "CLOSED"]));
    expect(audits).toHaveLength(4);
    expect((await listEnquiries(db, s.tenantId, { status: "NEW" })).counts).toEqual({ NEW: 1, CONTACTED: 0, CONVERTED: 0, CLOSED: 0 });
  });

  it("converts to the student admission created, once; Converted is final", async () => {
    const s = await institute();
    const other = await institute();
    await submitEnquiry(db, s.tenantId, { ...ok, courseId: s.course.id }, meta());
    const [e] = (await listEnquiries(db, s.tenantId)).items;
    const { student } = await students.admitStudent(db, s.actor, {
      fullName: e.name, gender: "FEMALE", guardianName: "G", guardianRelation: "MOTHER", guardianPhone: e.mobile, courseId: s.course.id, temporaryPassword: "Student123",
    });
    const { student: foreignStudent } = await students.admitStudent(db, other.actor, {
      fullName: "X", gender: "MALE", guardianName: "G", guardianRelation: "FATHER", guardianPhone: "01711000444", temporaryPassword: "Student123",
    });
    await expect(convertEnquiry(db, s.actor, e.id, foreignStudent.id)).rejects.toMatchObject({ code: "VALIDATION_STUDENT" });
    const converted = await convertEnquiry(db, s.actor, e.id, student.id);
    expect(converted).toMatchObject({ status: "CONVERTED", studentId: student.id, studentCode: student.studentCode });
    await expect(convertEnquiry(db, s.actor, e.id, student.id)).rejects.toMatchObject({ code: "CONFLICT_ENQUIRY_STATUS" });
    await expect(updateEnquiry(db, s.actor, e.id, { status: "NEW" })).rejects.toMatchObject({ code: "CONFLICT_ENQUIRY_STATUS" });
    expect((await updateEnquiry(db, s.actor, e.id, { note: "Joined the evening batch." })).note).toBe("Joined the evening batch.");
    expect(await testDb.select().from(auditLogs).where(eq(auditLogs.action, "ENQUIRY_CONVERTED"))).toHaveLength(1);
  });

  it("keeps a course named in an enquiry from being deleted", async () => {
    const s = await institute();
    await submitEnquiry(db, s.tenantId, { ...ok, courseId: s.course.id }, meta());
    await expect(academic.deleteCourse(db, s.actor, s.course.id)).rejects.toMatchObject({ code: "CONFLICT_COURSE_IN_USE" });
  });

  it("hides another institute's enquiries", async () => {
    const s = await institute();
    const other = await institute();
    await submitEnquiry(db, other.tenantId, ok, meta());
    const [theirs] = (await listEnquiries(db, other.tenantId)).items;
    expect((await listEnquiries(db, s.tenantId)).items).toHaveLength(0);
    await expect(getEnquiry(db, s.tenantId, theirs.id)).rejects.toMatchObject({ code: "NOT_FOUND_ENQUIRY" });
    await expect(updateEnquiry(db, s.actor, theirs.id, { status: "CLOSED" })).rejects.toMatchObject({ code: "NOT_FOUND_ENQUIRY" });
  });
});
