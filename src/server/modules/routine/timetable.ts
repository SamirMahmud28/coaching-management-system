import { addDays, weekdayOf } from "@/lib/dates";

/**
 * The dated timetable (D114, D116): the weekly class times (Core, D3) expanded over a date range, with institute
 * holidays and one-off changes applied. Pure — no database — so every rule is table-tested; the routine screens, the
 * portals and Attendance (when both modules are on) all use it.
 */

export type Weekday = "SAT" | "SUN" | "MON" | "TUE" | "WED" | "THU" | "FRI";

export interface Slot {
  batchSubjectId: string;
  weekday: Weekday;
  startsAt: string;
  endsAt: string;
}

export interface Change {
  id: string;
  batchSubjectId: string;
  classDate: string;
  startsAt: string;
  kind: "CANCEL" | "RESCHEDULE" | "SUBSTITUTE";
  reason: string | null;
  newDate: string | null;
  newStartsAt: string | null;
  newEndsAt: string | null;
  substituteInstructorId: string | null;
}

export interface Holiday {
  id: string;
  name: string;
  fromDate: string;
  toDate: string;
}

/**
 * SCHEDULED: happens as planned (possibly with a substitute). CANCELLED: cancelled on its own. HOLIDAY: the institute is
 * closed. MOVED_AWAY: rescheduled from here (see `movedTo`). MOVED_IN: rescheduled to here (see `movedFrom`).
 */
export type ClassStatus = "SCHEDULED" | "CANCELLED" | "HOLIDAY" | "MOVED_AWAY" | "MOVED_IN";

export interface DatedClass {
  batchSubjectId: string;
  date: string;
  startsAt: string;
  endsAt: string;
  status: ClassStatus;
  /** A cancellation's reason or the holiday's name. */
  reason: string | null;
  substituteInstructorId: string | null;
  changeId: string | null;
  holidayId: string | null;
  movedTo: { date: string; startsAt: string; endsAt: string } | null;
  movedFrom: { date: string; startsAt: string } | null;
}

/** "09:00:00" and "09:00" alike → "09:00". */
export const hhmm = (t: string) => t.slice(0, 5);
const key = (batchSubjectId: string, date: string, startsAt: string) => `${batchSubjectId}|${date}|${hhmm(startsAt)}`;

export function datesBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

const holidayOn = (holidays: readonly Holiday[], date: string) => holidays.find((h) => h.fromDate <= date && date <= h.toDate) ?? null;

/** Takes place (counts as a class someone teaches), as opposed to cancelled, closed or moved away. */
export const takesPlace = (c: Pick<DatedClass, "status">) => c.status === "SCHEDULED" || c.status === "MOVED_IN";

/**
 * Every class from `from` to `to` (inclusive), ordered by date and time. Pass the active changes whose original date
 * or new date falls in the range, and the holidays that overlap it.
 */
export function expandTimetable(input: { slots: readonly Slot[]; changes: readonly Change[]; holidays: readonly Holiday[]; from: string; to: string }): DatedClass[] {
  const { slots, changes, holidays, from, to } = input;
  const byClass = new Map(changes.map((c) => [key(c.batchSubjectId, c.classDate, c.startsAt), c]));
  const out: DatedClass[] = [];
  const base = { reason: null, substituteInstructorId: null, changeId: null, holidayId: null, movedTo: null, movedFrom: null };

  for (const date of datesBetween(from, to)) {
    const weekday = weekdayOf(date);
    for (const slot of slots) {
      if (slot.weekday !== weekday) continue;
      const cls: DatedClass = { ...base, batchSubjectId: slot.batchSubjectId, date, startsAt: hhmm(slot.startsAt), endsAt: hhmm(slot.endsAt), status: "SCHEDULED" };
      const change = byClass.get(key(slot.batchSubjectId, date, slot.startsAt));
      const holiday = holidayOn(holidays, date);
      if (change?.kind === "RESCHEDULE") {
        // A class moved away leaves its old date, holiday or not.
        out.push({ ...cls, status: "MOVED_AWAY", changeId: change.id, reason: change.reason, movedTo: { date: change.newDate!, startsAt: hhmm(change.newStartsAt!), endsAt: hhmm(change.newEndsAt!) } });
      } else if (holiday) {
        out.push({ ...cls, status: "HOLIDAY", holidayId: holiday.id, reason: holiday.name, changeId: change?.id ?? null });
      } else if (change?.kind === "CANCEL") {
        out.push({ ...cls, status: "CANCELLED", changeId: change.id, reason: change.reason });
      } else if (change?.kind === "SUBSTITUTE") {
        out.push({ ...cls, changeId: change.id, reason: change.reason, substituteInstructorId: change.substituteInstructorId });
      } else {
        out.push(cls);
      }
    }
  }
  // Classes moved into the range (from inside it or outside), even if their weekly slot has since been removed.
  for (const change of changes) {
    if (change.kind !== "RESCHEDULE" || !change.newDate || change.newDate < from || change.newDate > to) continue;
    const holiday = holidayOn(holidays, change.newDate);
    out.push({
      ...base,
      batchSubjectId: change.batchSubjectId,
      date: change.newDate,
      startsAt: hhmm(change.newStartsAt!),
      endsAt: hhmm(change.newEndsAt!),
      status: holiday ? "HOLIDAY" : "MOVED_IN",
      reason: holiday ? holiday.name : change.reason,
      holidayId: holiday?.id ?? null,
      changeId: change.id,
      movedFrom: { date: change.classDate, startsAt: hhmm(change.startsAt) },
    });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.startsAt.localeCompare(b.startsAt) || a.batchSubjectId.localeCompare(b.batchSubjectId));
}

/** Two time ranges on the same day overlap (touching ends don't). */
export const overlaps = (a: { startsAt: string; endsAt: string }, b: { startsAt: string; endsAt: string }) => hhmm(a.startsAt) < hhmm(b.endsAt) && hhmm(b.startsAt) < hhmm(a.endsAt);
