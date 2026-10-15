import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "../../core/testing/db";
import { setModules } from "../../core/testing/modules";
import { tenants, userRoles } from "../../core/db/schema";
import type { Db } from "../../core/db/types";
import { seedPlatformCatalog } from "../../core/db/seed";
import { INSTITUTE_OWNER_ROLE } from "../../core/rbac/catalog";
import { todayInDhaka } from "@/lib/dates";
import * as academic from "../academic/service";
import { createLogin } from "../auth/credentials";
import { preparePrint } from "../documents/pipeline";
import { seedBaselineRoles } from "../rbac/service";
import * as students from "../students/service";
import { addFine, confirmGeneration, listStudentCharges } from "./charges";
import { addRefund, collectPayment, voidPayment } from "./payments";
import { feeReportDocument, type FeeReportRecord } from "./report-document";
import { cleanRange, collectionReport, duesReport, refundsReport } from "./reports";
import { createFeeItem } from "./setup";

const { db: testDb, reset, close } = createTestDb();
const db = testDb as unknown as Db;

beforeEach(async () => {
  await reset();
  await seedPlatformCatalog(testDb);
});
afterAll(async () => {
  await close();
});

const today = todayInDhaka();
const range = { from: "2026-01-01", to: today };

/**
 * HSC (Morning: Anika, Dina; Evening: Bushra) and ICT (Chaity, and Anika too). Tuition for June and July and ICT's
 * fee are charged; Dina later leaves owing July.
 */
async function setUp() {
  const [tenant] = await testDb.insert(tenants).values({ name: "Reports", subdomain: "reports", status: "ACTIVE" }).returning();
  await setModules(db, tenant.id, ["fees"]);
  const roleIds = await seedBaselineRoles(db, tenant.id);
  const owner = await createLogin(db, { tenantId: tenant.id, name: "Owner", email: "o@reports.test", password: "OwnerPass1" });
  await testDb.insert(userRoles).values({ tenantId: tenant.id, userId: owner.id, roleId: roleIds[INSTITUTE_OWNER_ROLE] });
  const actor = { tenantId: tenant.id, userId: owner.id };
  const hsc = await academic.createCourse(db, actor, { name: "HSC", code: "HSC", dueDay: 10 });
  const ict = await academic.createCourse(db, actor, { name: "ICT", code: "ICT", dueDay: 10 });
  const morning = await academic.createBatch(db, actor, hsc.id, { name: "Morning" });
  const evening = await academic.createBatch(db, actor, hsc.id, { name: "Evening" });
  const weekend = await academic.createBatch(db, actor, ict.id, { name: "Weekend" });
  const tuition = await createFeeItem(db, actor, { courseId: hsc.id, kind: "MONTHLY", name: "Tuition", amount: "2000" });
  const ictFee = await createFeeItem(db, actor, { courseId: ict.id, kind: "ONE_TIME", name: "ICT fee", amount: "800" });
  const admit = async (fullName: string, batchIds: string[], phone: string) =>
    (
      await students.admitStudent(db, actor, {
        fullName, gender: "FEMALE", guardianName: "G", guardianRelation: "MOTHER", guardianPhone: phone, admissionDate: "2026-01-01", batchIds, temporaryPassword: "Student123",
      })
    ).student;
  const anika = await admit("Anika", [morning.id, weekend.id], "01711000001");
  const bushra = await admit("Bushra", [evening.id], "01711000002");
  const chaity = await admit("Chaity", [weekend.id], "01711000003");
  const dina = await admit("Dina", [morning.id], "01711000004");
  await confirmGeneration(db, actor, { feeItemId: tuition.id, period: "2026-06" });
  await confirmGeneration(db, actor, { feeItemId: tuition.id, period: "2026-07" });
  await confirmGeneration(db, actor, { feeItemId: ictFee.id });
  const charge = async (studentId: string, period: string) => (await listStudentCharges(db, tenant.id, studentId)).find((c) => c.period === period)!;
  const pay = async (studentId: string, chargeIds: string[], method: "CASH" | "BKASH", paidOn: string) =>
    (await collectPayment(db, actor, studentId, { chargeIds, method, reference: method === "CASH" ? null : "TX", paidOn, idempotencyKey: randomUUID() })).payment;
  return { tenant, owner, actor, hsc, ict, morning, evening, anika, bushra, chaity, dina, charge, pay };
}

describe("collection report", () => {
  it("lists valid payments with totals per method, subtracts refunds, and lists voids apart", async () => {
    const s = await setUp();
    // Anika pays June tuition and the ICT fee together, by bKash.
    await s.pay(s.anika.id, [(await s.charge(s.anika.id, "2026-06")).id, (await s.charge(s.anika.id, "ONCE")).id], "BKASH", "2026-08-01");
    await s.pay(s.bushra.id, [(await s.charge(s.bushra.id, "2026-06")).id], "CASH", "2026-08-02");
    const wrong = await s.pay(s.chaity.id, [(await s.charge(s.chaity.id, "ONCE")).id], "CASH", "2026-08-03");
    await voidPayment(db, s.actor, wrong.id, { reason: "Wrong student" });
    await addRefund(db, s.actor, (await s.charge(s.bushra.id, "2026-06")).id, { amount: "300", method: "CASH", reason: "Missed a week" });

    const report = await collectionReport(db, s.tenant.id, range);
    expect(report.payments.map((p) => [p.studentName, p.method, p.amount])).toEqual([
      ["Anika", "BKASH", "2800.00"],
      ["Bushra", "CASH", "2000.00"],
    ]);
    expect(report).toMatchObject({ collected: "4800.00", refunded: "300.00", net: "4500.00" });
    expect(report.byMethod).toEqual([
      { method: "BKASH", amount: "2800.00" },
      { method: "CASH", amount: "2000.00" },
    ]);
    expect(report.voided).toEqual([expect.objectContaining({ studentName: "Chaity", amount: "800.00", voidReason: "Wrong student" })]);

    // Course: only HSC charges count — Anika's payment shows its tuition part only, Chaity's ICT void drops out.
    const hsc = await collectionReport(db, s.tenant.id, range, { courseId: s.hsc.id });
    expect(hsc.payments.map((p) => [p.studentName, p.amount])).toEqual([
      ["Anika", "2000.00"],
      ["Bushra", "2000.00"],
    ]);
    expect(hsc.voided).toEqual([]);
    // Batch: Morning students only, and only the batch's course.
    const morning = await collectionReport(db, s.tenant.id, range, { batchId: s.morning.id });
    expect(morning).toMatchObject({ collected: "2000.00", refunded: "0.00", payments: [expect.objectContaining({ studentName: "Anika" })] });
    // A date range that excludes them.
    expect((await collectionReport(db, s.tenant.id, { from: "2026-08-02", to: "2026-08-02" })).payments.map((p) => p.studentName)).toEqual(["Bushra"]);
  });

  it("checks its dates and filters", async () => {
    const s = await setUp();
    expect(() => cleanRange("2026-08-05", "2026-08-01")).toThrow();
    expect(() => cleanRange("2026-02-30", undefined)).toThrow();
    expect(cleanRange(undefined, undefined)).toEqual({ from: `${today.slice(0, 7)}-01`, to: today });
    await expect(collectionReport(db, s.tenant.id, range, { courseId: s.ict.id, batchId: s.morning.id })).rejects.toMatchObject({ code: "VALIDATION_FILTER" });
  });
});

describe("dues report", () => {
  it("lists current students most overdue first, with mobiles only when allowed, and former students apart", async () => {
    const s = await setUp();
    await s.pay(s.bushra.id, [(await s.charge(s.bushra.id, "2026-06")).id, (await s.charge(s.bushra.id, "2026-07")).id], "CASH", "2026-08-02");
    await addFine(db, s.actor, s.chaity.id, { amount: "50", reason: "Late", dueDate: "2026-01-15" }); // overdue; generated charges are due today
    await students.setStudentStatus(db, s.actor, s.dina.id, { status: "LEFT", reason: "Moved" });

    const current = await duesReport(db, s.tenant.id, { withContacts: true });
    expect(current.rows.map((r) => [r.studentName, r.unpaidCount, r.totalDue, r.overdue, r.guardianPhone])).toEqual([
      ["Chaity", 2, "850.00", "50.00", "01711000003"],
      ["Anika", 3, "4800.00", "0.00", "01711000001"],
    ]);
    expect(current).toMatchObject({ totalDue: "5650.00", totalOverdue: "50.00" });
    expect((await duesReport(db, s.tenant.id)).rows.map((r) => r.guardianPhone)).toEqual([null, null]);

    const former = await duesReport(db, s.tenant.id, { former: true });
    expect(former.rows.map((r) => [r.studentName, r.status, r.totalDue])).toEqual([["Dina", "LEFT", "4000.00"]]);

    expect((await duesReport(db, s.tenant.id, { courseId: s.ict.id })).rows.map((r) => [r.studentName, r.totalDue])).toEqual([
      ["Anika", "800.00"],
      ["Chaity", "800.00"],
    ]);
    expect((await duesReport(db, s.tenant.id, { batchId: s.morning.id })).rows.map((r) => [r.studentName, r.totalDue])).toEqual([["Anika", "4000.00"]]);
  });
});

describe("refunds report and the printed report", () => {
  it("totals refunds and prints any report with the institute's branding, audited", async () => {
    const s = await setUp();
    const june = await s.charge(s.anika.id, "2026-06");
    await s.pay(s.anika.id, [june.id], "CASH", "2026-08-01");
    await addRefund(db, s.actor, june.id, { amount: "500", method: "BKASH", reference: "RF", reason: "Illness" });
    const refunds = await refundsReport(db, s.tenant.id, range);
    expect(refunds).toMatchObject({ total: "500.00", refunds: [expect.objectContaining({ studentName: "Anika", chargeTitle: "Tuition — June 2026", method: "BKASH" })] });

    const viewer = (permissions: string[]) => ({ tenantId: s.tenant.id, userId: s.owner.id, permissions: new Set(permissions), activeModules: ["core", "fees"] as never });
    const job = await preparePrint(db, viewer(["fees.report.view"]), feeReportDocument as never, { report: "dues", course_id: s.hsc.id });
    const record = job.records[0].data as FeeReportRecord;
    expect(record).toMatchObject({ report: "dues", title: "Fee dues — current students", filters: { course: "HSC", batch: null } });
    expect((record.data as Awaited<ReturnType<typeof duesReport>>).rows.every((r) => r.guardianPhone === null)).toBe(true); // no contact permission
    await expect(preparePrint(db, viewer(["fees.view"]), feeReportDocument as never, { report: "dues" })).rejects.toMatchObject({ code: "NOT_FOUND_DOCUMENT_TYPE" });
    await expect(preparePrint(db, viewer(["fees.report.view"]), feeReportDocument as never, { report: "everything" })).rejects.toMatchObject({ code: "VALIDATION_SELECTION" });
  });
});
