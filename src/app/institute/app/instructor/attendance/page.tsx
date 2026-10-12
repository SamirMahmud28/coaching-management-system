import type { Metadata } from "next";
import { isCalendarDate } from "@/lib/dates";
import { DayClassesPage } from "@/modules/institute/components/attendance/day-classes-page";
import { requireModulePage } from "@/server/modules/institute/current-user";

export const metadata: Metadata = { title: "Attendance" };

// The instructor's own classes only (D24, D81).
export default async function Page({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const { permissions } = await requireModulePage("attendance.view", "instructor");
  const { date } = await searchParams;
  return <DayClassesPage base="/app/instructor/attendance" date={date && isCalendarDate(date) ? date : undefined} canTake={permissions.has("attendance.take")} fullGuide={false} />;
}
