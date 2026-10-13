import type { Metadata } from "next";
import { WebsiteGalleryPage } from "@/modules/institute/components/website/gallery-page";
import { requireModulePage } from "@/server/modules/institute/current-user";

export const metadata: Metadata = { title: "Website gallery" };

// 404 when the Website module is off or without website.manage.
export default async function Page() {
  await requireModulePage("website.manage");
  return <WebsiteGalleryPage />;
}
