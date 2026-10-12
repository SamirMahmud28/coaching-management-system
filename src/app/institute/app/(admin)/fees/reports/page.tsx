import type { Metadata } from "next";
import { ReportsPage } from "@/modules/institute/components/fees/reports-page";
import { requireModulePage } from "@/server/modules/institute/current-user";

export const metadata: Metadata = { title: "Fee reports" };

export default async function Page() {
  const { permissions } = await requireModulePage("fees.report.view");
  return <ReportsPage canGenerate={permissions.has("fees.generate")} />;
}
