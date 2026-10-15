// Pure attendance rules, shared by the services, the reports and the portal.

import { tallyCounts, type AttendanceTally } from "./tally";

export { tallyCounts, type AttendanceTally };

export type AttendanceStatus = "PRESENT" | "ABSENT" | "LATE" | "EXCUSED";

/** Excused while approved leave covers the class; otherwise what a person marked, or null if nobody has. */
export function effectiveStatus(mark: { status: AttendanceStatus | null; leaveId: string | null }): AttendanceStatus | null {
  return mark.leaveId ? "EXCUSED" : mark.status;
}

/** Counts effective statuses; Excused and unmarked classes count neither way, and not-held classes never reach here. */
export function tally(statuses: readonly (AttendanceStatus | null)[]): AttendanceTally {
  const count = (s: AttendanceStatus) => statuses.filter((x) => x === s).length;
  return tallyCounts({ present: count("PRESENT"), late: count("LATE"), absent: count("ABSENT"), excused: count("EXCUSED") });
}

/**
 * Whether a class's register can be taken or changed now. On the class day (Bangladesh date) anyone who may mark it can;
 * afterwards only those with attendance.manage, and they must give a reason. A future class can't be marked.
 */
export function editRule(classDate: string, today: string, canManage: boolean): { allowed: boolean; reasonRequired: boolean; why?: string } {
  if (classDate > today) return { allowed: false, reasonRequired: false, why: "This class hasn't happened yet." };
  if (classDate === today) return { allowed: true, reasonRequired: false };
  if (!canManage) return { allowed: false, reasonRequired: false, why: "Only the class day's register can be taken or changed. Ask an Admin to correct it." };
  return { allowed: true, reasonRequired: true };
}
