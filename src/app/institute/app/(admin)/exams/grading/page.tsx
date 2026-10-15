import type { Metadata } from "next";
import { GradeScalePage } from "@/modules/institute/components/exams/grade-scale-page";
import { requireModulePage } from "@/server/modules/institute/current-user";

export const metadata: Metadata = { title: "Grading scale" };

// The institute's grading scale. 404 when Exams is off or without exams.manage.
export default async function Page() {
  await requireModulePage("exams.manage");
  return <GradeScalePage />;
}
