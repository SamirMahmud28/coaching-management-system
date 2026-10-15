/** The attendance percentage rule, shared by registers, reports and the dashboard. */
export interface AttendanceTally {
  present: number;
  late: number;
  absent: number;
  excused: number;
  /** (Present + Late) ÷ (Present + Late + Absent) as a percentage with one decimal, or null when nothing counts yet. */
  percentage: number | null;
}

/** The rule from counts already made (e.g. by a SQL group-by over many marks, as the dashboard does). */
export function tallyCounts(c: { present: number; late: number; absent: number; excused: number }): AttendanceTally {
  const counted = c.present + c.late + c.absent;
  return { ...c, percentage: counted ? Math.round(((c.present + c.late) * 1000) / counted) / 10 : null };
}
