// Pure attendance rules (D82, D84, D87, D91, D93), shared by the services, the reports and the portal.

export type AttendanceStatus = "PRESENT" | "ABSENT" | "LATE" | "EXCUSED";

/** Excused while approved leave covers the class (D91); otherwise what a person marked, or null if nobody has (D93). */
export function effectiveStatus(mark: { status: AttendanceStatus | null; leaveId: string | null }): AttendanceStatus | null {
  return mark.leaveId ? "EXCUSED" : mark.status;
}

export interface AttendanceTally {
  present: number;
  late: number;
  absent: number;
  excused: number;
  /** (Present + Late) ÷ (Present + Late + Absent) as a percentage with one decimal, or null when nothing counts yet. */
  percentage: number | null;
}

/** Counts effective statuses; Excused and unmarked classes count neither way, and not-held classes never reach here (D87). */
export function tally(statuses: readonly (AttendanceStatus | null)[]): AttendanceTally {
  const count = (s: AttendanceStatus) => statuses.filter((x) => x === s).length;
  const present = count("PRESENT");
  const late = count("LATE");
  const absent = count("ABSENT");
  const excused = count("EXCUSED");
  const counted = present + late + absent;
  return { present, late, absent, excused, percentage: counted ? Math.round(((present + late) * 1000) / counted) / 10 : null };
}

/**
 * Whether a class's register can be taken or changed now. On the class day (Bangladesh date) anyone who may mark it can;
 * afterwards only those with attendance.manage, and they must give a reason (D82, D84). A future class can't be marked.
 */
export function editRule(classDate: string, today: string, canManage: boolean): { allowed: boolean; reasonRequired: boolean; why?: string } {
  if (classDate > today) return { allowed: false, reasonRequired: false, why: "This class hasn't happened yet." };
  if (classDate === today) return { allowed: true, reasonRequired: false };
  if (!canManage) return { allowed: false, reasonRequired: false, why: "Only the class day's register can be taken or changed. Ask an Admin to correct it." };
  return { allowed: true, reasonRequired: true };
}
