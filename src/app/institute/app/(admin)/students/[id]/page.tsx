import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { StudentProfilePage } from "@/modules/institute/components/students/student-profile-page";
import { isUuid } from "@/server/core/db/tenant-scope";
import { requireModulePage } from "@/server/modules/institute/current-user";

export const metadata: Metadata = { title: "Student" };

// The record itself is loaded through the API, which 404s for another institute's id.
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const { permissions } = await requireModulePage("students.view");
  return (
    <StudentProfilePage
      id={id}
      perms={{
        canUpdate: permissions.has("students.update"),
        canSetStatus: permissions.has("students.status"),
        canManageBatches: permissions.has("students.batches.manage") && permissions.has("academic.view"),
        canSeeContacts: permissions.has("students.contact.view"),
      }}
    />
  );
}
