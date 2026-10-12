import type { Metadata } from "next";
import { MyLeavePage } from "@/modules/institute/components/portal/my-leave-page";
import { requireModulePage } from "@/server/modules/institute/current-user";

export const metadata: Metadata = { title: "Leave" };

// The student's own leave (D89, D92, D93). 404 when Attendance is off.
export default async function Page() {
  await requireModulePage("leave.self.apply", "student");
  return <MyLeavePage />;
}
