import type { Metadata } from "next";
import { ExamsListPage } from "@/modules/institute/components/exams/exams-list-page";
import { requireModulePage } from "@/server/modules/institute/current-user";

export const metadata: Metadata = { title: "Exams" };

// The exams of the instructor's batches (D24).
export default async function Page() {
  await requireModulePage("exams.view", "instructor");
  return <ExamsListPage base="/app/instructor/exams" canManage={false} fullGuide={false} />;
}
