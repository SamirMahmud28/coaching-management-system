import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MarksPage } from "@/modules/institute/components/exams/marks-page";
import { isUuid } from "@/server/core/db/tenant-scope";
import { requireModulePage } from "@/server/modules/institute/current-user";

export const metadata: Metadata = { title: "Marks" };

// The roster comes from the API, which 404s for another institute's paper or one the viewer doesn't teach (D24).
export default async function Page({ params }: { params: Promise<{ paperId: string }> }) {
  const { paperId } = await params;
  if (!isUuid(paperId)) notFound();
  await requireModulePage("exams.view");
  return <MarksPage base="/app/exams" paperId={paperId} />;
}
