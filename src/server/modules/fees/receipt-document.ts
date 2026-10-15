import { and, eq, inArray } from "drizzle-orm";
import { batchMemberships, batches, courses, feeCharges, feePaymentAllocations, students } from "../../core/db/schema";
import type { DocumentTypeDefinition } from "../../core/documents/types";
import { ValidationError } from "../../core/errors";
import { isUuid } from "../../core/db/tenant-scope";
import { takaInWords, toPoisha } from "@/lib/money";
import { getPayment } from "./payments";

/** What a printed receipt shows: the payment as recorded, never recomputed. */
export interface FeeReceiptRecord {
  receiptLabel: string;
  paidOn: string;
  method: string;
  reference: string | null;
  amount: string;
  amountInWords: string;
  remarks: string | null;
  receivedBy: string | null;
  status: "VALID" | "VOID";
  voidReason: string | null;
  voidedOn: string | null;
  student: { name: string; code: string };
  /** The courses of the charges paid, with the student's current batches in them, e.g. "HSC 2026 Science · Morning". */
  programme: string | null;
  lines: { title: string; amount: string }[];
}

/**
 * One payment's receipt, printed or reprinted from the stored payment (printing never creates a record). Staff with
 * fees.view print any; a student with fees.self.view only their own. Voided receipts print with a VOID mark.
 */
export const feeReceiptDocument: DocumentTypeDefinition<FeeReceiptRecord, { paymentId: string }> = {
  key: "fee-receipt",
  label: "Fee receipt",
  module: "fees",
  permission: "fees.view",
  selfPermission: "fees.self.view",
  format: { kind: "a4", perPage: 1 },
  parseSelection: (query) => {
    if (!query.payment || !isUuid(query.payment)) throw new ValidationError("VALIDATION_SELECTION", "Choose a payment to print.");
    return { paymentId: query.payment };
  },
  describeSelection: (s) => ({ paymentId: s.paymentId }),
  load: async (db, { tenantId, scope, selection }) => {
    const payment = await getPayment(db, tenantId, selection.paymentId).catch(() => null);
    if (!payment) return { records: [] };
    const [student] = await db
      .select({ name: students.fullName, code: students.studentCode, userId: students.userId })
      .from(students)
      .where(and(eq(students.tenantId, tenantId), eq(students.id, payment.studentId)));
    if (scope.kind === "self" && student.userId !== scope.userId) return { records: [] };

    const courseRows = await db
      .selectDistinct({ id: courses.id, name: courses.name })
      .from(feePaymentAllocations)
      .innerJoin(feeCharges, and(eq(feeCharges.tenantId, feePaymentAllocations.tenantId), eq(feeCharges.id, feePaymentAllocations.chargeId)))
      .innerJoin(courses, and(eq(courses.tenantId, feeCharges.tenantId), eq(courses.id, feeCharges.courseId)))
      .where(and(eq(feePaymentAllocations.tenantId, tenantId), eq(feePaymentAllocations.paymentId, payment.id)));
    const batchRows = courseRows.length
      ? await db
          .select({ courseId: batches.courseId, name: batches.name })
          .from(batchMemberships)
          .innerJoin(batches, and(eq(batches.tenantId, batchMemberships.tenantId), eq(batches.id, batchMemberships.batchId)))
          .where(
            and(
              eq(batchMemberships.tenantId, tenantId),
              eq(batchMemberships.studentId, payment.studentId),
              eq(batchMemberships.status, "ACTIVE"),
              inArray(batches.courseId, courseRows.map((c) => c.id)),
            ),
          )
      : [];
    const programme =
      courseRows
        .map((c) => [c.name, ...batchRows.filter((b) => b.courseId === c.id).map((b) => b.name)].join(" · "))
        .join("; ") || null;

    return {
      records: [
        {
          id: payment.id,
          data: {
            receiptLabel: payment.receiptLabel,
            paidOn: payment.paidOn,
            method: payment.method,
            reference: payment.reference,
            amount: payment.amount,
            amountInWords: takaInWords(toPoisha(payment.amount)),
            remarks: payment.remarks,
            receivedBy: payment.receivedByName,
            status: payment.status,
            voidReason: payment.voidReason,
            voidedOn: payment.voidedAt ? payment.voidedAt.toISOString().slice(0, 10) : null,
            student: { name: student.name, code: student.code },
            programme,
            lines: payment.lines.map((l) => ({ title: l.title, amount: l.amount })),
          },
        },
      ],
    };
  },
};
