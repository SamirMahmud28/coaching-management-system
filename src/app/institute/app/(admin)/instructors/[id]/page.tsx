import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { InstructorProfilePage } from "@/modules/institute/components/instructors/instructor-profile-page";
import { isUuid } from "@/server/core/db/tenant-scope";
import { requireModulePage } from "@/server/modules/institute/current-user";

export const metadata: Metadata = { title: "Instructor" };

// The record itself is loaded through the API, which 404s for another institute's id.
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const { permissions } = await requireModulePage("instructors.view");
  return <InstructorProfilePage id={id} canManage={permissions.has("instructors.manage")} canSetStatus={permissions.has("instructors.status")} />;
}
