import type { Metadata } from "next";
import { ExamFormPage } from "@/modules/institute/components/exams/exam-form-page";
import { requireModulePage } from "@/server/modules/institute/current-user";

export const metadata: Metadata = { title: "New exam" };

export default async function Page() {
  await requireModulePage("exams.manage");
  return <ExamFormPage base="/app/exams" />;
}
