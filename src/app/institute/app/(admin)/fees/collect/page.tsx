import type { Metadata } from "next";
import { CollectPage } from "@/modules/institute/components/fees/collect-page";
import { feesNav } from "@/modules/institute/components/fees/fees-nav";
import { requireModulePage } from "@/server/modules/institute/current-user";

export const metadata: Metadata = { title: "Collect" };

// The counter: find a student and collect. 404 when Fees is off or without fees.collect.
export default async function Page() {
  const { permissions } = await requireModulePage("fees.collect");
  return <CollectPage nav={feesNav(permissions)} canWaive={permissions.has("fees.waive")} canFine={permissions.has("fees.adjust")} />;
}
