import type { Metadata } from "next";
import { RoutinePage } from "@/modules/institute/components/routine/routine-page";
import { requireModulePage } from "@/server/modules/institute/current-user";

export const metadata: Metadata = { title: "Routine" };

// Replaces the paid-module placeholder for Routine. 404 when the module is off or without routine.view.
export default async function Page() {
  const { permissions } = await requireModulePage("routine.view");
  return <RoutinePage canManage={permissions.has("routine.manage")} />;
}
