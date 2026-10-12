import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { StudentFeesPage } from "@/modules/institute/components/fees/student-fees-page";
import { isUuid } from "@/server/core/db/tenant-scope";
import { requireModulePage } from "@/server/modules/institute/current-user";

export const metadata: Metadata = { title: "Student fees" };

// The charges themselves load through the API, which 404s for another institute's student.
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const { permissions } = await requireModulePage("fees.view");
  return (
    <StudentFeesPage
      studentId={id}
      perms={{ canViewStudent: permissions.has("students.view"), canAdjust: permissions.has("fees.adjust"), canCancel: permissions.has("fees.generate") }}
    />
  );
}
