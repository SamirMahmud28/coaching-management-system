import type { Metadata } from "next";
import { WebsiteFacultyPage } from "@/modules/institute/components/website/faculty-page";
import { requireModulePage } from "@/server/modules/institute/current-user";

export const metadata: Metadata = { title: "Website faculty" };

// 404 when the Website module is off or without website.manage.
export default async function Page() {
  await requireModulePage("website.manage");
  return <WebsiteFacultyPage />;
}
