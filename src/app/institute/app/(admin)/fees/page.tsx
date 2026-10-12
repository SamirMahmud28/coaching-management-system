import type { Metadata } from "next";
import { FeeItemsPage } from "@/modules/institute/components/fees/fee-items-page";
import { requireModulePage } from "@/server/modules/institute/current-user";

export const metadata: Metadata = { title: "Fees" };

// Replaces the paid-module placeholder for Fees. 404 when the module is off or without fees.view.
export default async function Page() {
  const { permissions } = await requireModulePage("fees.view");
  return <FeeItemsPage canConfigure={permissions.has("fees.configure")} canGenerate={permissions.has("fees.generate")} />;
}
