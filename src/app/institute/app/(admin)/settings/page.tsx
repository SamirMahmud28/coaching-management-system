import type { Metadata } from "next";
import { InstituteSettingsPage } from "@/modules/institute/components/settings/settings-page";
import { requireModulePage } from "@/server/modules/institute/current-user";

export const metadata: Metadata = { title: "Settings" };

export default async function Page() {
  await requireModulePage("settings.manage");
  return <InstituteSettingsPage />;
}
