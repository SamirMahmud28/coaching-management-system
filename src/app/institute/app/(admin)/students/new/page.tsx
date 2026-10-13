import type { Metadata } from "next";
import { AdmitStudentPage } from "@/modules/institute/components/students/admit-student-page";
import { requireModulePage } from "@/server/modules/institute/current-user";

export const metadata: Metadata = { title: "Admit a student" };

export default async function Page({ searchParams }: { searchParams: Promise<{ enquiry?: string }> }) {
  const { permissions } = await requireModulePage("students.create");
  const { enquiry } = await searchParams;
  // "Convert" from the enquiry inbox (D129); only with the inbox's permission, which also means the Website module is on.
  const enquiryId = enquiry && permissions.has("website.manage") && /^[0-9a-f-]{36}$/i.test(enquiry) ? enquiry : null;
  return <AdmitStudentPage canJoinBatches={permissions.has("students.batches.manage") && permissions.has("academic.view")} enquiryId={enquiryId} />;
}
