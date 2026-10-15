import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LessonPlanPage } from "@/modules/institute/components/routine/lessons-pages";
import { isUuid } from "@/server/core/db/tenant-scope";
import { requireModulePage } from "@/server/modules/institute/current-user";

export const metadata: Metadata = { title: "Lesson plan" };

// Plans of the instructor's batches; they edit the subjects they teach.
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  await requireModulePage("routine.view", "instructor");
  return <LessonPlanPage base="/app/instructor/routine" batchSubjectId={id} fullGuide={false} />;
}
