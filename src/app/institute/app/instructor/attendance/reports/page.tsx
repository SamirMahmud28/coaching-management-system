import type { Metadata } from "next";
import { AttendanceReportsPage } from "@/modules/institute/components/attendance/attendance-reports-page";
import { requireModulePage } from "@/server/modules/institute/current-user";

export const metadata: Metadata = { title: "Attendance reports" };

// The subjects the instructor teaches only, never guardian mobiles (D24, D88).
export default async function Page() {
  await requireModulePage("attendance.report.view", "instructor");
  return <AttendanceReportsPage base="/app/instructor/attendance" fullGuide={false} />;
}
