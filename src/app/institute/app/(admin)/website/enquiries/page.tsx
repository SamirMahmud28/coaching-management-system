import type { Metadata } from "next";
import { EnquiriesPage } from "@/modules/institute/components/website/enquiries-page";
import { requireModulePage } from "@/server/modules/institute/current-user";

export const metadata: Metadata = { title: "Admission enquiries" };

// 404 when the Website module is off or without website.manage (D127). Convert needs admission too.
export default async function Page() {
  const { permissions } = await requireModulePage("website.manage");
  return <EnquiriesPage canAdmit={permissions.has("students.create")} />;
}
