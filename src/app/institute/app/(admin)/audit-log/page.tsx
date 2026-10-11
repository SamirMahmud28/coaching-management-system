import type { Metadata } from "next";
import { InstituteAuditLogPage } from "@/modules/institute/components/audit-log-page";
import { requireModulePage } from "@/server/modules/institute/current-user";

export const metadata: Metadata = { title: "Audit log" };

export default async function Page() {
  await requireModulePage("audit.view");
  return <InstituteAuditLogPage />;
}
