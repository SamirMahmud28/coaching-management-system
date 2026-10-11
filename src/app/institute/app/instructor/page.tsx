import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { requirePortal } from "@/server/modules/institute/current-user";

export const metadata: Metadata = { title: "Instructor portal" };

// The instructor portal's content (batches, schedule, …) arrives with M7.
export default async function Page() {
  const { session } = await requirePortal("instructor");
  return <PageHeader title={`Welcome, ${session.name}`} description={session.tenant.name} />;
}
