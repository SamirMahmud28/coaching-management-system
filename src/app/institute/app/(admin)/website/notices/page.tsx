import type { Metadata } from "next";
import { WebsiteNoticesPage } from "@/modules/institute/components/website/notices-page";
import { requireModulePage } from "@/server/modules/institute/current-user";

export const metadata: Metadata = { title: "Website notices" };

// 404 when the Website module is off or without website.manage.
export default async function Page() {
  await requireModulePage("website.manage");
  return <WebsiteNoticesPage />;
}
