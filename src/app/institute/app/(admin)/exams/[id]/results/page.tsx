import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ResultsPage } from "@/modules/institute/components/exams/results-page";
import { isUuid } from "@/server/core/db/tenant-scope";
import { requireModulePage } from "@/server/modules/institute/current-user";

export const metadata: Metadata = { title: "Results" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const { permissions } = await requireModulePage("exams.view");
  return <ResultsPage base="/app/exams" examId={id} canPublish={permissions.has("exams.publish")} />;
}
