import type { Metadata } from "next";
import { InstituteModulesPage } from "@/modules/institute/components/modules-page";
import { requireModulePage } from "@/server/modules/institute/current-user";

export const metadata: Metadata = { title: "Modules" };

export default async function Page() {
  await requireModulePage("modules.view");
  return <InstituteModulesPage />;
}
