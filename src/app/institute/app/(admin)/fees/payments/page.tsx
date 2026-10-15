import type { Metadata } from "next";
import { feesNav } from "@/modules/institute/components/fees/fees-nav";
import { PaymentsPage } from "@/modules/institute/components/fees/payments-page";
import { requireModulePage } from "@/server/modules/institute/current-user";

export const metadata: Metadata = { title: "Payments" };

// Every receipt in a date range. 404 when Fees is off or without fees.view.
export default async function Page() {
  const { permissions } = await requireModulePage("fees.view");
  return <PaymentsPage nav={feesNav(permissions)} canVoid={permissions.has("fees.payment.void")} />;
}
