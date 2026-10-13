import type { Metadata } from "next";
import { RoutinePage } from "@/modules/institute/components/routine/routine-page";
import { requireModulePage } from "@/server/modules/institute/current-user";

export const metadata: Metadata = { title: "Routine" };

// The instructor's batches and own week, with changes (D24, D117); only the office changes the routine (D115).
export default async function Page() {
  await requireModulePage("routine.view", "instructor");
  return <RoutinePage canManage={false} base="/app/instructor/routine" fullGuide={false} />;
}
