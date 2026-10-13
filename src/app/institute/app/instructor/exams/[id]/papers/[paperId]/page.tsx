import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MarksPage } from "@/modules/institute/components/exams/marks-page";
import { isUuid } from "@/server/core/db/tenant-scope";
import { requireModulePage } from "@/server/modules/institute/current-user";

export const metadata: Metadata = { title: "Marks" };

// Only a paper of a subject the instructor teaches; any other is a 404 from the API (D24).
export default async function Page({ params }: { params: Promise<{ paperId: string }> }) {
  const { paperId } = await params;
  if (!isUuid(paperId)) notFound();
  await requireModulePage("exams.view", "instructor");
  return <MarksPage base="/app/instructor/exams" paperId={paperId} fullGuide={false} />;
}
