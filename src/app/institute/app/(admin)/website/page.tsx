import type { Metadata } from "next";
import { WebsiteEditorPage } from "@/modules/institute/components/website/website-editor-page";
import { requireModulePage } from "@/server/modules/institute/current-user";

export const metadata: Metadata = { title: "Website" };

// Replaces the paid-module placeholder for Website. 404 when the module is off or without website.manage.
export default async function Page() {
  await requireModulePage("website.manage");
  return <WebsiteEditorPage />;
}
