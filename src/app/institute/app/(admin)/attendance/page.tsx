import type { Metadata } from "next";
import { isCalendarDate } from "@/lib/dates";
import { DayClassesPage } from "@/modules/institute/components/attendance/day-classes-page";
import { requireModulePage } from "@/server/modules/institute/current-user";

export const metadata: Metadata = { title: "Attendance" };

// Replaces the paid-module placeholder for Attendance. 404 when the module is off or without attendance.view.
export default async function Page({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const { permissions } = await requireModulePage("attendance.view");
  const { date } = await searchParams;
  return <DayClassesPage base="/app/attendance" date={date && isCalendarDate(date) ? date : undefined} canTake={permissions.has("attendance.take")} canManageLeave={permissions.has("leave.manage")} canReport={permissions.has("attendance.report.view")} />;
}
