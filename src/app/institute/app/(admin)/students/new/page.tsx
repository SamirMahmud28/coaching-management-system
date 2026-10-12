import type { Metadata } from "next";
import { AdmitStudentPage } from "@/modules/institute/components/students/admit-student-page";
import { requireModulePage } from "@/server/modules/institute/current-user";

export const metadata: Metadata = { title: "Admit a student" };

export default async function Page() {
  const { permissions } = await requireModulePage("students.create");
  return <AdmitStudentPage canJoinBatches={permissions.has("students.batches.manage") && permissions.has("academic.view")} />;
}
