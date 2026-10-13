import type { Metadata } from "next";
import { LessonOverviewPage } from "@/modules/institute/components/routine/lessons-pages";
import { requireModulePage } from "@/server/modules/institute/current-user";

export const metadata: Metadata = { title: "Lesson plans" };

export default async function Page() {
  await requireModulePage("routine.view");
  return <LessonOverviewPage base="/app/routine" />;
}
