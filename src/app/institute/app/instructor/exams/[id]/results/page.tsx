import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ResultsPage } from "@/modules/institute/components/exams/results-page";
import { isUuid } from "@/server/core/db/tenant-scope";
import { requireModulePage } from "@/server/modules/institute/current-user";

export const metadata: Metadata = { title: "Results" };

// Their own batches, with combined positions; instructors can't publish.
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  await requireModulePage("exams.view", "instructor");
  return <ResultsPage base="/app/instructor/exams" examId={id} canPublish={false} fullGuide={false} />;
}
