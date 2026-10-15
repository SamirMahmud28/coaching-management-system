import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LessonPlanPage } from "@/modules/institute/components/routine/lessons-pages";
import { isUuid } from "@/server/core/db/tenant-scope";
import { requireModulePage } from "@/server/modules/institute/current-user";

export const metadata: Metadata = { title: "Lesson plan" };

// The plan is loaded through the API, which 404s for a batch subject the viewer can't see.
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  await requireModulePage("routine.view");
  return <LessonPlanPage base="/app/routine" batchSubjectId={id} />;
}
