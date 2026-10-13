import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ExamPage } from "@/modules/institute/components/exams/exam-page";
import { isUuid } from "@/server/core/db/tenant-scope";
import { requireModulePage } from "@/server/modules/institute/current-user";

export const metadata: Metadata = { title: "Exam" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  await requireModulePage("exams.view", "instructor");
  return <ExamPage base="/app/instructor/exams" examId={id} canManage={false} fullGuide={false} />;
}
