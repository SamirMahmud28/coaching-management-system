import { check, date, foreignKey, index, integer, jsonb, numeric, pgEnum, pgTable, timestamp, unique, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { academicStatusEnum, courses } from "./academic";
import { tenants, users } from "./core";
import { students } from "./students";

// Fees & Payments (paid module `fees`): D26, D28–D44, D62–D65. Money is numeric(14,2); arithmetic happens in integer
// poisha (src/lib/money.ts). Charges, waivers, payments, allocations and refunds are history: database triggers
// (migration 0006_fees_guards) refuse deletes and edits, apart from cancelling a charge or voiding a payment once.

export const feeItemKindEnum = pgEnum("fee_item_kind", ["ADMISSION", "MONTHLY", "ONE_TIME"]);
export const feeChargeSourceEnum = pgEnum("fee_charge_source", ["GENERATED", "FINE"]);
export const feeChargeStatusEnum = pgEnum("fee_charge_status", ["ACTIVE", "CANCELLED"]);
export const feePaymentMethodEnum = pgEnum("fee_payment_method", ["CASH", "BANK_TRANSFER", "CHEQUE", "BKASH", "NAGAD", "ROCKET", "OTHER"]);
export const feePaymentStatusEnum = pgEnum("fee_payment_status", ["VALID", "VOID"]);
export const feeWaiverKindEnum = pgEnum("fee_waiver_kind", ["FIXED", "PERCENT"]);

/** Per-institute fee settings: the receipt prefix (D38). */
export const feeSettings = pgTable("fee_settings", {
  tenantId: uuid("tenant_id").primaryKey().references(() => tenants.id),
  receiptPrefix: varchar("receipt_prefix", { length: 10 }).notNull().default("R"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  updatedBy: uuid("updated_by"),
}, (t) => [check("fee_settings_receipt_prefix", sql`${t.receiptPrefix} ~ '^[A-Z][A-Z0-9]{0,9}$'`)]);

/** A course's fee (D28): admission (one-time), monthly, or another one-time fee. Archived, never deleted once charged. */
export const feeItems = pgTable("fee_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  courseId: uuid("course_id").notNull(),
  kind: feeItemKindEnum("kind").notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  // The amount new charges use; existing charges keep the amount they were created with.
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  status: academicStatusEnum("status").notNull().default("ACTIVE"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid("created_by"),
  updatedBy: uuid("updated_by"),
}, (t) => [
  unique("fee_items_tenant_id_unique").on(t.tenantId, t.id),
  uniqueIndex("fee_items_course_name_lower_idx").on(t.tenantId, t.courseId, sql`lower(${t.name})`),
  foreignKey({ name: "fee_items_course_fk", columns: [t.tenantId, t.courseId], foreignColumns: [courses.tenantId, courses.id] }),
  check("fee_items_amount_positive", sql`${t.amount} > 0`),
]);

/** A different amount for one student's fee item, with a reason (D29). Zero means the student isn't charged it. */
export const studentFeeAmounts = pgTable("student_fee_amounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  studentId: uuid("student_id").notNull(),
  feeItemId: uuid("fee_item_id").notNull(),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  reason: varchar("reason", { length: 300 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid("created_by"),
  updatedBy: uuid("updated_by"),
}, (t) => [
  unique("student_fee_amounts_student_item_unique").on(t.tenantId, t.studentId, t.feeItemId),
  foreignKey({ name: "student_fee_amounts_student_fk", columns: [t.tenantId, t.studentId], foreignColumns: [students.tenantId, students.id] }),
  foreignKey({ name: "student_fee_amounts_item_fk", columns: [t.tenantId, t.feeItemId], foreignColumns: [feeItems.tenantId, feeItems.id] }),
  check("student_fee_amounts_amount", sql`${t.amount} >= 0`),
]);

/** One confirmed generation (D30, D62): a fee item, a period (YYYY-MM or ONCE), what it charged and what it skipped. */
export const feeGenerationRuns = pgTable("fee_generation_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  feeItemId: uuid("fee_item_id").notNull(),
  period: varchar("period", { length: 7 }).notNull(),
  createdCount: integer("created_count").notNull(),
  // Students not charged, counted by reason (ON_HOLD, ALREADY_CHARGED, JOINED_LATER, ...).
  skipped: jsonb("skipped").$type<Record<string, number>>().notNull(),
  totalAmount: numeric("total_amount", { precision: 14, scale: 2 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid("created_by"),
}, (t) => [
  unique("fee_generation_runs_tenant_id_unique").on(t.tenantId, t.id),
  index("fee_generation_runs_item_idx").on(t.tenantId, t.feeItemId, t.createdAt),
  foreignKey({ name: "fee_generation_runs_item_fk", columns: [t.tenantId, t.feeItemId], foreignColumns: [feeItems.tenantId, feeItems.id] }),
  check("fee_generation_runs_period", sql`${t.period} = 'ONCE' OR ${t.period} ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'`),
]);

/**
 * What a student owes for one fee item and period, or a manual fine (D34). Everything it needs later is copied in when
 * it's created, so later edits to fee items never reach it. Never deleted; cancelled at most once (D43).
 */
export const feeCharges = pgTable("fee_charges", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  studentId: uuid("student_id").notNull(),
  // The course the charge belongs to; a fine may name one or not.
  courseId: uuid("course_id"),
  feeItemId: uuid("fee_item_id"),
  generationRunId: uuid("generation_run_id"),
  source: feeChargeSourceEnum("source").notNull(),
  title: varchar("title", { length: 150 }).notNull(),
  // YYYY-MM for a monthly fee, ONCE for a one-time fee, null for a fine.
  period: varchar("period", { length: 7 }),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  dueDate: date("due_date").notNull(),
  // A fine's reason.
  note: varchar("note", { length: 300 }),
  status: feeChargeStatusEnum("status").notNull().default("ACTIVE"),
  cancelReason: varchar("cancel_reason", { length: 300 }),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  cancelledBy: uuid("cancelled_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid("created_by"),
}, (t) => [
  unique("fee_charges_tenant_id_unique").on(t.tenantId, t.id),
  // No duplicates (D30, D62): one active charge per student, fee item and month; a one-time fee once per student.
  uniqueIndex("fee_charges_active_month_idx")
    .on(t.tenantId, t.studentId, t.feeItemId, t.period)
    .where(sql`${t.status} = 'ACTIVE' AND ${t.period} IS NOT NULL AND ${t.period} <> 'ONCE'`),
  uniqueIndex("fee_charges_active_once_idx").on(t.tenantId, t.studentId, t.feeItemId).where(sql`${t.status} = 'ACTIVE' AND ${t.period} = 'ONCE'`),
  index("fee_charges_student_idx").on(t.tenantId, t.studentId),
  index("fee_charges_run_idx").on(t.tenantId, t.generationRunId),
  index("fee_charges_due_idx").on(t.tenantId, t.status, t.dueDate),
  foreignKey({ name: "fee_charges_student_fk", columns: [t.tenantId, t.studentId], foreignColumns: [students.tenantId, students.id] }),
  foreignKey({ name: "fee_charges_course_fk", columns: [t.tenantId, t.courseId], foreignColumns: [courses.tenantId, courses.id] }),
  foreignKey({ name: "fee_charges_item_fk", columns: [t.tenantId, t.feeItemId], foreignColumns: [feeItems.tenantId, feeItems.id] }),
  foreignKey({ name: "fee_charges_run_fk", columns: [t.tenantId, t.generationRunId], foreignColumns: [feeGenerationRuns.tenantId, feeGenerationRuns.id] }),
  check("fee_charges_amount_positive", sql`${t.amount} > 0`),
  check(
    "fee_charges_source",
    sql`(${t.source} = 'GENERATED' AND ${t.feeItemId} IS NOT NULL AND ${t.generationRunId} IS NOT NULL AND ${t.courseId} IS NOT NULL AND ${t.period} IS NOT NULL)
     OR (${t.source} = 'FINE' AND ${t.feeItemId} IS NULL AND ${t.generationRunId} IS NULL AND ${t.period} IS NULL AND ${t.note} IS NOT NULL)`,
  ),
  check(
    "fee_charges_cancellation",
    sql`(${t.status} = 'ACTIVE' AND ${t.cancelledAt} IS NULL AND ${t.cancelReason} IS NULL) OR (${t.status} = 'CANCELLED' AND ${t.cancelledAt} IS NOT NULL AND ${t.cancelReason} IS NOT NULL)`,
  ),
]);

/** A one-off reduction of one unpaid charge, fixed or percent, with a reason (D33). Never changed or deleted. */
export const feeWaivers = pgTable("fee_waivers", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  chargeId: uuid("charge_id").notNull(),
  kind: feeWaiverKindEnum("kind").notNull(),
  // Taka for FIXED, percent for PERCENT, as entered.
  value: numeric("value", { precision: 14, scale: 2 }).notNull(),
  // What it takes off the charge, in taka.
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  reason: varchar("reason", { length: 300 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid("created_by"),
}, (t) => [
  index("fee_waivers_charge_idx").on(t.tenantId, t.chargeId),
  foreignKey({ name: "fee_waivers_charge_fk", columns: [t.tenantId, t.chargeId], foreignColumns: [feeCharges.tenantId, feeCharges.id] }),
  check("fee_waivers_amount_positive", sql`${t.amount} > 0`),
  check("fee_waivers_value", sql`${t.value} > 0 AND (${t.kind} = 'FIXED' OR ${t.value} <= 100)`),
]);

/** The next receipt number per institute, taken under a row lock inside the payment's transaction (D38). */
export const feeReceiptCounters = pgTable("fee_receipt_counters", {
  tenantId: uuid("tenant_id").primaryKey().references(() => tenants.id),
  nextValue: integer("next_value").notNull().default(1),
});

/**
 * Money received from one student for one or more whole charges (D31), with its receipt. Never changed or deleted;
 * voided once with a reason by Owner/Admin (D35). The receipt label is stored, so a later prefix change never alters it.
 */
export const feePayments = pgTable("fee_payments", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  studentId: uuid("student_id").notNull(),
  receiptNo: integer("receipt_no").notNull(),
  receiptLabel: varchar("receipt_label", { length: 20 }).notNull(),
  // The day the money was received (Bangladesh date); earlier than the day it was recorded means backdated.
  paidOn: date("paid_on").notNull(),
  method: feePaymentMethodEnum("method").notNull(),
  // Transaction id or cheque number; required for everything but cash (D39).
  reference: varchar("reference", { length: 100 }),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  remarks: varchar("remarks", { length: 500 }),
  receivedBy: uuid("received_by").notNull(),
  // Sent by the collect form, so a double-submitted payment is recorded once.
  idempotencyKey: uuid("idempotency_key").notNull(),
  status: feePaymentStatusEnum("status").notNull().default("VALID"),
  voidedAt: timestamp("voided_at", { withTimezone: true }),
  voidedBy: uuid("voided_by"),
  voidReason: varchar("void_reason", { length: 300 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique("fee_payments_tenant_id_unique").on(t.tenantId, t.id),
  unique("fee_payments_tenant_receipt_unique").on(t.tenantId, t.receiptNo),
  unique("fee_payments_tenant_idempotency_unique").on(t.tenantId, t.idempotencyKey),
  index("fee_payments_paid_on_idx").on(t.tenantId, t.paidOn),
  index("fee_payments_student_idx").on(t.tenantId, t.studentId),
  foreignKey({ name: "fee_payments_student_fk", columns: [t.tenantId, t.studentId], foreignColumns: [students.tenantId, students.id] }),
  foreignKey({ name: "fee_payments_received_by_fk", columns: [t.tenantId, t.receivedBy], foreignColumns: [users.tenantId, users.id] }),
  check("fee_payments_amount_positive", sql`${t.amount} > 0`),
  check("fee_payments_reference", sql`${t.method} = 'CASH' OR ${t.reference} IS NOT NULL`),
  check(
    "fee_payments_void",
    sql`(${t.status} = 'VALID' AND ${t.voidedAt} IS NULL AND ${t.voidReason} IS NULL) OR (${t.status} = 'VOID' AND ${t.voidedAt} IS NOT NULL AND ${t.voidReason} IS NOT NULL)`,
  ),
]);

/** Which whole charges a payment settled, and for how much (each charge's full remaining amount, D31). Never changes. */
export const feePaymentAllocations = pgTable("fee_payment_allocations", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  paymentId: uuid("payment_id").notNull(),
  chargeId: uuid("charge_id").notNull(),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
}, (t) => [
  unique("fee_payment_allocations_payment_charge_unique").on(t.tenantId, t.paymentId, t.chargeId),
  index("fee_payment_allocations_charge_idx").on(t.tenantId, t.chargeId),
  foreignKey({ name: "fee_payment_allocations_payment_fk", columns: [t.tenantId, t.paymentId], foreignColumns: [feePayments.tenantId, feePayments.id] }),
  foreignKey({ name: "fee_payment_allocations_charge_fk", columns: [t.tenantId, t.chargeId], foreignColumns: [feeCharges.tenantId, feeCharges.id] }),
  check("fee_payment_allocations_amount_positive", sql`${t.amount} > 0`),
]);

/**
 * Money given back against a paid charge (D36, D37): up to what was paid; the charge stays settled. Never changed or
 * deleted.
 */
export const feeRefunds = pgTable("fee_refunds", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  chargeId: uuid("charge_id").notNull(),
  // The payment that settled the charge.
  paymentId: uuid("payment_id").notNull(),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  method: feePaymentMethodEnum("method").notNull(),
  reference: varchar("reference", { length: 100 }),
  reason: varchar("reason", { length: 300 }).notNull(),
  refundedOn: date("refunded_on").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid("created_by").notNull(),
}, (t) => [
  index("fee_refunds_charge_idx").on(t.tenantId, t.chargeId),
  index("fee_refunds_refunded_on_idx").on(t.tenantId, t.refundedOn),
  foreignKey({ name: "fee_refunds_charge_fk", columns: [t.tenantId, t.chargeId], foreignColumns: [feeCharges.tenantId, feeCharges.id] }),
  foreignKey({ name: "fee_refunds_payment_fk", columns: [t.tenantId, t.paymentId], foreignColumns: [feePayments.tenantId, feePayments.id] }),
  foreignKey({ name: "fee_refunds_created_by_fk", columns: [t.tenantId, t.createdBy], foreignColumns: [users.tenantId, users.id] }),
  check("fee_refunds_amount_positive", sql`${t.amount} > 0`),
]);
