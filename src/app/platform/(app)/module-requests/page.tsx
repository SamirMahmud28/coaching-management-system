import type { Metadata } from "next";
import { ModuleRequestsPage } from "@/modules/platform/components/module-requests-page";

export const metadata: Metadata = { title: "Module requests" };

export default function Page() {
  return <ModuleRequestsPage />;
}
