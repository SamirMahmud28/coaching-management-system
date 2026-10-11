import type { Metadata } from "next";
import { TenantDetailPage } from "@/modules/platform/components/tenant-detail-page";

export const metadata: Metadata = { title: "Institute" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TenantDetailPage id={id} />;
}
