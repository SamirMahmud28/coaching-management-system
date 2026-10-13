import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ExamPage } from "@/modules/institute/components/exams/exam-page";
import { isUuid } from "@/server/core/db/tenant-scope";
import { requireModulePage } from "@/server/modules/institute/current-user";

export const metadata: Metadata = { title: "Exam" };

// The exam is loaded through the API, which 404s for another institute's id or a batch the viewer doesn't teach.
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const { permissions } = await requireModulePage("exams.view");
  return <ExamPage base="/app/exams" examId={id} canManage={permissions.has("exams.manage")} />;
}
