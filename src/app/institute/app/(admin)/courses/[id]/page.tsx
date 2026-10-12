import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CoursePage } from "@/modules/institute/components/academic/course-page";
import { isUuid } from "@/server/core/db/tenant-scope";
import { requireModulePage } from "@/server/modules/institute/current-user";

export const metadata: Metadata = { title: "Course" };

// The record itself is loaded through the API, which 404s for another institute's id.
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const { permissions } = await requireModulePage("academic.view");
  return <CoursePage id={id} canManage={permissions.has("academic.manage")} />;
}
