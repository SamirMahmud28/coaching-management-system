import { and, eq, inArray } from "drizzle-orm";
import { batchMemberships, instructors, lessonTopics, students } from "../../core/db/schema";
import type { DbOrTx } from "../../core/db/types";
import { addDays, todayInDhaka } from "@/lib/dates";
import { lessonOverviewFor, summarise, type TopicStatus } from "./lessons";
import { timetable, type RoutineClass } from "./service";

// The portals' view of the routine (D27, D117): upcoming changes for a student's batches or an instructor's classes,
// and a student's lesson progress.

const UPCOMING_DAYS = 14;
const changed = (c: RoutineClass) => c.status !== "SCHEDULED" || !!c.substituteName;

async function studentBatchIds(db: DbOrTx, tenantId: string, userId: string) {
  const rows = await db
    .select({ batchId: batchMemberships.batchId })
    .from(batchMemberships)
    .innerJoin(students, and(eq(students.tenantId, batchMemberships.tenantId), eq(students.id, batchMemberships.studentId)))
    .where(and(eq(batchMemberships.tenantId, tenantId), eq(students.userId, userId), eq(batchMemberships.status, "ACTIVE")));
  return [...new Set(rows.map((r) => r.batchId))];
}

/** Changes in the next two weeks to a student's classes (D117). */
export async function upcomingChangesForStudent(db: DbOrTx, tenantId: string, userId: string) {
  const batchIds = await studentBatchIds(db, tenantId, userId);
  if (!batchIds.length) return [];
  const today = todayInDhaka();
  return (await timetable(db, tenantId, today, addDays(today, UPCOMING_DAYS - 1), { batchIds })).filter(changed);
}

/** Changes in the next two weeks to the classes an instructor teaches or covers (D117, D121). */
export async function upcomingChangesForInstructor(db: DbOrTx, tenantId: string, userId: string) {
  const [me] = await db.select({ id: instructors.id }).from(instructors).where(and(eq(instructors.tenantId, tenantId), eq(instructors.userId, userId)));
  if (!me) return [];
  const today = todayInDhaka();
  const all = await timetable(db, tenantId, today, addDays(today, UPCOMING_DAYS - 1));
  return all.filter((c) => changed(c) && (c.regularInstructors.some((i) => i.id === me.id) || c.substituteInstructorId === me.id));
}

/** A student's lesson progress per subject of their current batches (D27, D118). */
export async function myLessonProgress(db: DbOrTx, tenantId: string, userId: string) {
  const batchIds = await studentBatchIds(db, tenantId, userId);
  if (!batchIds.length) return [];
  const overview = await lessonOverviewFor(db, tenantId, batchIds);
  const ids = overview.map((o) => o.id);
  const topics = ids.length
    ? await db.select().from(lessonTopics).where(and(eq(lessonTopics.tenantId, tenantId), inArray(lessonTopics.batchSubjectId, ids)))
    : [];
  const today = todayInDhaka();
  return overview
    .map((o) => {
      const mine = topics.filter((t) => t.batchSubjectId === o.id).sort((a, b) => a.position - b.position);
      return {
        ...o,
        progress: summarise(mine, today),
        topics: mine.map((t) => ({ title: t.title, status: t.status as TopicStatus, targetDate: t.targetDate, overdue: t.status !== "COMPLETED" && !!t.targetDate && t.targetDate < today })),
      };
    })
    .filter((o) => o.topics.length > 0);
}

