import type { Metadata } from "next";
import { LeavePage } from "@/modules/institute/components/attendance/leave-page";
import { requireModulePage } from "@/server/modules/institute/current-user";

export const metadata: Metadata = { title: "Leave" };

// Leave applications and office-entered leave (D89–D93). 404 when Attendance is off or without leave.manage.
export default async function Page() {
  await requireModulePage("leave.manage");
  return <LeavePage />;
}
