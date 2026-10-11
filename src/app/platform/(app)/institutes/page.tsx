import type { Metadata } from "next";
import { TenantsListPage } from "@/modules/platform/components/tenants-list-page";

export const metadata: Metadata = { title: "Institutes" };

export default function Page() {
  return <TenantsListPage />;
}
