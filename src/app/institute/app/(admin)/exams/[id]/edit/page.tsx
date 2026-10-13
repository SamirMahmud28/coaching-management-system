import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ExamFormPage } from "@/modules/institute/components/exams/exam-form-page";
import { isUuid } from "@/server/core/db/tenant-scope";
import { requireModulePage } from "@/server/modules/institute/current-user";

export const metadata: Metadata = { title: "Edit exam" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  await requireModulePage("exams.manage");
  return <ExamFormPage base="/app/exams" examId={id} />;
}
