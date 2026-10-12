import type { Metadata } from "next";
import { GeneratePage } from "@/modules/institute/components/fees/generate-page";
import { requireModulePage } from "@/server/modules/institute/current-user";

export const metadata: Metadata = { title: "Generate charges" };

export default async function Page() {
  const { permissions } = await requireModulePage("fees.generate");
  return <GeneratePage canReport={permissions.has("fees.report.view")} />;
}
