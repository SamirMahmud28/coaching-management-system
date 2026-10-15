import type { Metadata } from "next";
import { todayInDhaka } from "@/lib/dates";
import { DashboardPage } from "@/modules/institute/components/dashboard/dashboard-page";
import { requirePortal } from "@/server/modules/institute/current-user";

export const metadata: Metadata = { title: "Dashboard" };

// Each widget shows only to someone who may see its figures; every widget's API checks the same on the server.
export default async function InstituteDashboardPage() {
  const { session, permissions } = await requirePortal("admin");
  const today = new Date(`${todayInDhaka()}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  return <DashboardPage name={session.name} subtitle={`${today} · ${session.tenant.name}`} permissions={[...permissions]} />;
}
