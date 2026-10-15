import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { createTestDb } from "../../core/testing/db";
import { setModules } from "../../core/testing/modules";
import { auditLogs, tenants, userRoles } from "../../core/db/schema";
import type { Db } from "../../core/db/types";
import { seedPlatformCatalog } from "../../core/db/seed";
import { INSTITUTE_OWNER_ROLE } from "../../core/rbac/catalog";
import * as academic from "../academic/service";
import { createLogin } from "../auth/credentials";
import { createTenantAuth } from "../auth/tenant-auth";
import { seedBaselineRoles } from "../rbac/service";
import * as students from "../students/service";
import { createFeesHandlers } from "./http";
import { receiptLabel } from "./setup";

const { db: testDb, reset, close } = createTestDb();
const db = testDb as unknown as Db;
const host = { baseDomain: "localhost:3000", platformHost: "admin.localhost:3000" };
const auth = createTenantAuth(db, { secret: "test-secret-".padEnd(40, "x"), host, protocol: "http" });
const h = createFeesHandlers({ db, auth, host });

beforeEach(async () => {
  await reset();
  await seedPlatformCatalog(testDb);
});
afterAll(async () => {
  await close();
});

const HOST = "fees-a.localhost:3000";
let cookie = "";
function req(method: string, body?: unknown) {
  return new Request(`http://${HOST}/api/v1/fees`, {
    method,
    headers: { host: HOST, origin: `http://${HOST}`, "content-type": "application/json", cookie },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
async function call(res: Promise<Response>) {
  const r = await res;
  return { status: r.status, body: r.status === 204 ? null : await r.json() };
}

async function setUp() {
  const [tenant] = await testDb.insert(tenants).values({ name: "Fees A", subdomain: "fees-a", status: "ACTIVE" }).returning();
  const roleIds = await seedBaselineRoles(db, tenant.id);
  const owner = await createLogin(db, { tenantId: tenant.id, name: "Owner", email: "owner@fees-a.test", password: "OwnerPass1", mustChangePassword: false });
  await testDb.insert(userRoles).values({ tenantId: tenant.id, userId: owner.id, roleId: roleIds[INSTITUTE_OWNER_ROLE] });
  await setModules(db, tenant.id, ["fees"]);
  const res = await auth.handler(
    new Request(`http://${HOST}/api/auth/tenant/sign-in`, {
      method: "POST",
      headers: { host: HOST, origin: `http://${HOST}`, "content-type": "application/json" },
      body: JSON.stringify({ identifier: "owner@fees-a.test", password: "OwnerPass1" }),
    }),
  );
  cookie = res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  const actor = { tenantId: tenant.id, userId: owner.id };
  const hsc = await academic.createCourse(db, actor, { name: "HSC 2026", code: "HSC26", dueDay: 10 });
  const ict = await academic.createCourse(db, actor, { name: "ICT", code: "ICT" });
  return { tenant, actor, hsc, ict };
}
const createItem = (body: object) => call(h.createItem(req("POST", body)));

describe("fee items", () => {
  it("creates a course's fees with amounts as exact taka, and refuses bad input", async () => {
    const s = await setUp();
    const tuition = await createItem({ course_id: s.hsc.id, kind: "MONTHLY", name: "Tuition", amount: "2000" });
    expect(tuition.status).toBe(201);
    expect(tuition.body).toMatchObject({ kind: "MONTHLY", name: "Tuition", amount: "2000.00", status: "ACTIVE" });
    await createItem({ course_id: s.hsc.id, kind: "ADMISSION", name: "Admission", amount: "1500.5" });

    expect((await createItem({ course_id: s.hsc.id, kind: "MONTHLY", name: "X", amount: "12.345" })).body.error.code).toBe("VALIDATION_AMOUNT");
    expect((await createItem({ course_id: s.hsc.id, kind: "MONTHLY", name: "X", amount: "0" })).body.error.code).toBe("VALIDATION_AMOUNT");
    expect((await createItem({ course_id: s.hsc.id, kind: "MONTHLY", name: "X", amount: "-5" })).body.error.code).toBe("VALIDATION_AMOUNT");
    expect((await createItem({ course_id: s.hsc.id, kind: "MONTHLY", name: "tuition", amount: "1" })).body.error.code).toBe("CONFLICT_FEE_ITEM_NAME");
    await academic.setCourseStatus(db, s.actor, s.ict.id, "ARCHIVED");
    expect((await createItem({ course_id: s.ict.id, kind: "MONTHLY", name: "Tuition", amount: "1" })).body.error.code).toBe("CONFLICT_COURSE_ARCHIVED");

    const list = await call(h.listItems(req("GET")));
    expect(list.body.map((i: { name: string; amount: string; course_due_day: number }) => [i.name, i.amount, i.course_due_day])).toEqual([
      ["Admission", "1500.50", 10],
      ["Tuition", "2000.00", 10],
    ]);
  });

  it("changes amounts for future charges (audited), archives, and deletes only an unused item", async () => {
    const s = await setUp();
    const item = (await createItem({ course_id: s.hsc.id, kind: "MONTHLY", name: "Tuition", amount: "2000" })).body;
    const updated = await call(h.updateItem(req("PATCH", { amount: "2200" }), { id: item.id }));
    expect(updated.body.amount).toBe("2200.00");
    const [entry] = await testDb.select().from(auditLogs).where(and(eq(auditLogs.action, "FEE_ITEM_UPDATED"), eq(auditLogs.resourceId, item.id)));
    expect(entry.oldValue).toMatchObject({ amount: "2000.00" });

    expect((await call(h.setItemStatus(req("PATCH", { status: "ARCHIVED" }), { id: item.id }))).body.status).toBe("ARCHIVED");
    expect((await call(h.listItems(new Request(`http://${HOST}/api/v1/fees/items?status=ACTIVE`, { headers: { host: HOST, cookie } })))).body).toEqual([]);

    // A course with fee items can't be deleted.
    await expect(academic.deleteCourse(db, s.actor, s.hsc.id)).rejects.toMatchObject({ code: "CONFLICT_COURSE_IN_USE" });

    const { student } = await students.admitStudent(db, s.actor, { fullName: "A", gender: "MALE", guardianName: "G", guardianRelation: "FATHER", guardianPhone: "01711000111", temporaryPassword: "Student123" });
    await call(h.setStudentAmount(req("PUT", { fee_item_id: item.id, amount: "1000", reason: "Sibling" }), { id: student.id }));
    expect((await call(h.deleteItem(req("DELETE"), { id: item.id }))).body.error.code).toBe("CONFLICT_FEE_ITEM_IN_USE");

    const unused = (await createItem({ course_id: s.hsc.id, kind: "ONE_TIME", name: "Exam fee", amount: "300" })).body;
    expect((await call(h.deleteItem(req("DELETE"), { id: unused.id }))).status).toBe(204);
  });
});

describe("a student's own amounts", () => {
  it("lists the fees of the student's current courses and sets, changes and removes their own amount with a reason", async () => {
    const s = await setUp();
    const tuition = (await createItem({ course_id: s.hsc.id, kind: "MONTHLY", name: "Tuition", amount: "2000" })).body;
    await createItem({ course_id: s.ict.id, kind: "MONTHLY", name: "ICT fee", amount: "800" });
    const morning = await academic.createBatch(db, s.actor, s.hsc.id, { name: "Morning" });
    const { student } = await students.admitStudent(db, s.actor, {
      fullName: "A", gender: "MALE", guardianName: "G", guardianRelation: "FATHER", guardianPhone: "01711000111", batchIds: [morning.id], temporaryPassword: "Student123",
    });

    const list = await call(h.studentAmounts(req("GET"), { id: student.id }));
    expect(list.body).toEqual([expect.objectContaining({ fee_item_id: tuition.id, name: "Tuition", course_amount: "2000.00", amount: null })]); // not in ICT

    const set = (body: object) => call(h.setStudentAmount(req("PUT", body), { id: student.id }));
    expect((await set({ fee_item_id: tuition.id, amount: "1500", reason: "" })).body.error.code).toBe("VALIDATION_REQUIRED");
    expect((await set({ fee_item_id: tuition.id, amount: "1500", reason: "Sibling rate" })).body).toMatchObject({ amount: "1500.00", reason: "Sibling rate" });
    expect((await set({ fee_item_id: tuition.id, amount: "0", reason: "Full scholarship" })).body.amount).toBe("0.00");
    const own = (await call(h.studentAmounts(req("GET"), { id: student.id }))).body[0];
    expect(own).toMatchObject({ amount: "0.00", reason: "Full scholarship" });
    const actions = (await testDb.select().from(auditLogs).where(eq(auditLogs.action, "STUDENT_FEE_AMOUNT_SET"))).map((e) => (e.newValue as { amount: string }).amount);
    expect(actions.sort()).toEqual(["0.00", "1500.00"]);

    expect((await call(h.removeStudentAmount(req("DELETE"), { id: own.id }))).status).toBe(204);
    expect((await call(h.studentAmounts(req("GET"), { id: student.id }))).body[0].amount).toBeNull();
  });
});

describe("receipt prefix", () => {
  it("defaults to R, is saved upper-cased, and labels receipts PREFIX-000123", async () => {
    await setUp();
    expect((await call(h.getSettings(req("GET")))).body).toEqual({ receipt_prefix: "R" });
    expect((await call(h.saveSettings(req("PUT", { receipt_prefix: "kcr" })))).body).toEqual({ receipt_prefix: "KCR" });
    expect((await call(h.saveSettings(req("PUT", { receipt_prefix: "1R" })))).body.error.code).toBe("VALIDATION_RECEIPT_PREFIX");
    expect((await call(h.getSettings(req("GET")))).body).toEqual({ receipt_prefix: "KCR" });
    expect(receiptLabel("KCR", 123)).toBe("KCR-000123");
    expect(receiptLabel("R", 1234567)).toBe("R-1234567");
  });
});
