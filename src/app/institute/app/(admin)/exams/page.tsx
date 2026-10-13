import type { Metadata } from "next";
import { ExamsListPage } from "@/modules/institute/components/exams/exams-list-page";
import { requireModulePage } from "@/server/modules/institute/current-user";

export const metadata: Metadata = { title: "Exams" };

// Replaces the paid-module placeholder for Exams. 404 when the module is off or without exams.view.
export default async function Page() {
  const { permissions } = await requireModulePage("exams.view");
  return <ExamsListPage base="/app/exams" canManage={permissions.has("exams.manage")} />;
}
