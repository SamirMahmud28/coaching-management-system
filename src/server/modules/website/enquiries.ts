import { and, count, desc, eq, gte } from "drizzle-orm";
import { courses, enquiries, students } from "../../core/db/schema";
import { inTransaction } from "../../core/db/transaction";
import type { DbOrTx } from "../../core/db/types";
import { AppError, ConflictError, NotFoundError, ValidationError } from "../../core/errors";
import { normalizeBdMobile } from "@/lib/bd-phone";
import { audit } from "../audit/service";
import type { Actor } from "./settings";
import "./references";

// Admission enquiries (D22, D129): the public form with spam protection, and the Owner/Admin inbox (D127). The same
// checks as the EMS demo-request form (`demo-requests/service.ts`): a hidden honeypot field, a minimum fill time and a
// per-IP limit. No SMS or email alerts (D22).

export const MIN_FILL_MS = 3000;
export const MAX_ENQUIRIES_PER_IP_PER_HOUR = 5;

export type EnquiryStatus = "NEW" | "CONTACTED" | "CONVERTED" | "CLOSED";

/** Status changes by hand; Converted is set only by "Convert" and is final (D22). */
const NEXT: Record<EnquiryStatus, EnquiryStatus[]> = {
  NEW: ["CONTACTED", "CLOSED"],
  CONTACTED: ["NEW", "CLOSED"],
  CLOSED: ["NEW"],
  CONVERTED: [],
};

export interface EnquirySubmission {
  name: string;
  mobile: string;
  courseId?: string | null;
  message?: string | null;
  /** The hidden field; people leave it empty. */
  website?: string | null;
  /** When the visitor opened the form (ms since epoch, from their browser). */
  startedAt?: number | null;
}

function text(value: string | null | undefined, max: number, field: string, label: string, required = false): string | null {
  const v = value?.trim() ?? "";
  if (required && !v) throw new ValidationError("VALIDATION_REQUIRED", `${label} is required.`, { field });
  if (v.length > max) throw new ValidationError("VALIDATION_TEXT", `${label} can be at most ${max} characters.`, { field });
  return v === "" ? null : v;
}

/**
 * Stores an enquiry from the public form. Likely spam (honeypot filled, or sent faster than a person can type) is
 * dropped while appearing to succeed, so bots learn nothing. A sender over the hourly limit is told to try later.
 */
export async function submitEnquiry(db: DbOrTx, tenantId: string, input: EnquirySubmission, meta: { ipAddress: string | null; now?: Date }): Promise<{ stored: boolean }> {
  const now = meta.now ?? new Date();
  if (input.website?.trim() || (input.startedAt != null && now.getTime() - input.startedAt < MIN_FILL_MS)) return { stored: false };

  const name = text(input.name, 100, "name", "The student's name", true)!;
  const mobile = normalizeBdMobile(input.mobile ?? "");
  if (!mobile) throw new ValidationError("VALIDATION_PHONE", "Enter a valid Bangladeshi mobile number, e.g. 01712345678.", { field: "mobile" });
  const message = text(input.message, 1000, "message", "The message");
  let courseId: string | null = null;
  if (input.courseId) {
    const [course] = await db.select({ id: courses.id }).from(courses).where(and(eq(courses.tenantId, tenantId), eq(courses.id, input.courseId), eq(courses.status, "ACTIVE")));
    if (!course) throw new ValidationError("VALIDATION_COURSE", "Choose one of the courses listed.", { field: "courseId" });
    courseId = course.id;
  }

  if (meta.ipAddress) {
    const since = new Date(now.getTime() - 60 * 60 * 1000);
    const [{ n }] = await db
      .select({ n: count() })
      .from(enquiries)
      .where(and(eq(enquiries.tenantId, tenantId), eq(enquiries.ipAddress, meta.ipAddress), gte(enquiries.createdAt, since)));
    if (n >= MAX_ENQUIRIES_PER_IP_PER_HOUR) throw new AppError("RATE_LIMITED", 429, "You've sent several enquiries already. Please try again in an hour, or call the institute.");
  }

  await db.insert(enquiries).values({ tenantId, name, mobile, courseId, message, ipAddress: meta.ipAddress, createdAt: now, updatedAt: now });
  return { stored: true };
}

const enquiryColumns = {
  id: enquiries.id,
  name: enquiries.name,
  mobile: enquiries.mobile,
  courseId: enquiries.courseId,
  courseName: courses.name,
  message: enquiries.message,
  status: enquiries.status,
  note: enquiries.note,
  studentId: enquiries.studentId,
  studentCode: students.studentCode,
  createdAt: enquiries.createdAt,
  updatedAt: enquiries.updatedAt,
};

const withJoins = (db: DbOrTx) =>
  db
    .select(enquiryColumns)
    .from(enquiries)
    .leftJoin(courses, and(eq(courses.tenantId, enquiries.tenantId), eq(courses.id, enquiries.courseId)))
    .leftJoin(students, and(eq(students.tenantId, enquiries.tenantId), eq(students.id, enquiries.studentId)));

/** The inbox, newest first, optionally by status, with the number in each status. */
export async function listEnquiries(db: DbOrTx, tenantId: string, filter: { status?: EnquiryStatus } = {}) {
  const where = filter.status ? and(eq(enquiries.tenantId, tenantId), eq(enquiries.status, filter.status)) : eq(enquiries.tenantId, tenantId);
  const [items, counts] = await Promise.all([
    withJoins(db).where(where).orderBy(desc(enquiries.createdAt)).limit(500),
    db.select({ status: enquiries.status, n: count() }).from(enquiries).where(eq(enquiries.tenantId, tenantId)).groupBy(enquiries.status),
  ]);
  const byStatus = { NEW: 0, CONTACTED: 0, CONVERTED: 0, CLOSED: 0 } satisfies Record<EnquiryStatus, number>;
  for (const c of counts) byStatus[c.status] = Number(c.n);
  return { items, counts: byStatus };
}

export async function getEnquiry(db: DbOrTx, tenantId: string, id: string) {
  const [row] = await withJoins(db).where(and(eq(enquiries.tenantId, tenantId), eq(enquiries.id, id)));
  if (!row) throw new NotFoundError("ENQUIRY");
  return row;
}

/** Changes the status and/or the note. Status changes are audited (non-negotiable 6). */
export async function updateEnquiry(db: DbOrTx, actor: Actor, id: string, input: { status?: EnquiryStatus; note?: string | null }) {
  const note = input.note === undefined ? undefined : text(input.note, 500, "note", "The note");
  return inTransaction(db, async (tx) => {
    const current = await getEnquiry(tx, actor.tenantId, id);
    const status = input.status ?? current.status;
    if (status !== current.status && !NEXT[current.status].includes(status)) {
      const message = current.status === "CONVERTED" ? "This enquiry is already converted to a student." : status === "CONVERTED" ? "Use Convert to admit the student." : "That status change isn't allowed.";
      throw new ConflictError("CONFLICT_ENQUIRY_STATUS", message);
    }
    await tx
      .update(enquiries)
      .set({ status, ...(note !== undefined ? { note } : {}), updatedAt: new Date(), updatedBy: actor.userId })
      .where(and(eq(enquiries.tenantId, actor.tenantId), eq(enquiries.id, id)));
    if (status !== current.status) {
      await audit.record(tx, {
        tenantId: actor.tenantId, actorType: "TENANT_USER", userId: actor.userId, action: "ENQUIRY_STATUS_CHANGED", resourceType: "ENQUIRY", resourceId: id,
        oldValue: { status: current.status }, newValue: { status },
      });
    }
    return getEnquiry(tx, actor.tenantId, id);
  });
}

/** Links the student that admission created from this enquiry and marks it Converted (final). Audited. */
export async function convertEnquiry(db: DbOrTx, actor: Actor, id: string, studentId: string) {
  return inTransaction(db, async (tx) => {
    const current = await getEnquiry(tx, actor.tenantId, id);
    if (current.status === "CONVERTED") throw new ConflictError("CONFLICT_ENQUIRY_STATUS", "This enquiry is already converted to a student.");
    const [student] = await tx.select({ id: students.id }).from(students).where(and(eq(students.tenantId, actor.tenantId), eq(students.id, studentId)));
    if (!student) throw new ValidationError("VALIDATION_STUDENT", "That student isn't available.", { field: "studentId" });
    await tx
      .update(enquiries)
      .set({ status: "CONVERTED", studentId, updatedAt: new Date(), updatedBy: actor.userId })
      .where(and(eq(enquiries.tenantId, actor.tenantId), eq(enquiries.id, id)));
    await audit.record(tx, {
      tenantId: actor.tenantId, actorType: "TENANT_USER", userId: actor.userId, action: "ENQUIRY_CONVERTED", resourceType: "ENQUIRY", resourceId: id,
      oldValue: { status: current.status }, newValue: { status: "CONVERTED", studentId },
    });
    return getEnquiry(tx, actor.tenantId, id);
  });
}
