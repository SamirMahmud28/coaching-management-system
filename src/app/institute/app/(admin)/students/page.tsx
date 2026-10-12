import type { Metadata } from "next";
import { StudentsListPage } from "@/modules/institute/components/students/students-list-page";
import { requireModulePage } from "@/server/modules/institute/current-user";

export const metadata: Metadata = { title: "Students" };

export default async function Page() {
  const { permissions } = await requireModulePage("students.view");
  return (
    <StudentsListPage
      canAdmit={permissions.has("students.create")}
      canSeeContacts={permissions.has("students.contact.view")}
      canSeeBatches={permissions.has("academic.view")}
    />
  );
}
