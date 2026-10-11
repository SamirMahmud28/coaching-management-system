import type { Metadata } from "next";
import { AdminsPage } from "@/modules/platform/components/admins-page";

export const metadata: Metadata = { title: "Platform admins" };

export default function Page() {
  return <AdminsPage />;
}
