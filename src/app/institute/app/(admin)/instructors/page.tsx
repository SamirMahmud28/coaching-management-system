import type { Metadata } from "next";
import { InstructorsListPage } from "@/modules/institute/components/instructors/instructors-list-page";
import { requireModulePage } from "@/server/modules/institute/current-user";

export const metadata: Metadata = { title: "Instructors" };

export default async function Page() {
  const { permissions } = await requireModulePage("instructors.view");
  return <InstructorsListPage canManage={permissions.has("instructors.manage")} />;
}
