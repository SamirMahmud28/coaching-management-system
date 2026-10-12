import type { Metadata } from "next";
import { AttendanceReportsPage } from "@/modules/institute/components/attendance/attendance-reports-page";
import { requireModulePage } from "@/server/modules/institute/current-user";

export const metadata: Metadata = { title: "Attendance reports" };

// Monthly register, low attendance and absentees (D88). 404 when Attendance is off or without attendance.report.view.
export default async function Page() {
  const { permissions } = await requireModulePage("attendance.report.view");
  return <AttendanceReportsPage base="/app/attendance" canManageLeave={permissions.has("leave.manage")} canViewStudents={permissions.has("students.view")} />;
}
