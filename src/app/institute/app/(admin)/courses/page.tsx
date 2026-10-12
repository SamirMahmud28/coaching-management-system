import type { Metadata } from "next";
import { CoursesListPage } from "@/modules/institute/components/academic/courses-list-page";
import { requireModulePage } from "@/server/modules/institute/current-user";

export const metadata: Metadata = { title: "Courses & batches" };

export default async function Page() {
  const { permissions } = await requireModulePage("academic.view");
  return <CoursesListPage canManage={permissions.has("academic.manage")} />;
}
