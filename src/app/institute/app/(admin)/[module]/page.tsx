import { Construction } from "lucide-react";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/states";
import { PAID_MODULE_NAV, isPaidModuleKey } from "@/modules/institute/modules";
import { requireModulePage } from "@/server/modules/institute/current-user";

// Landing page for a paid module until its own screens are built. Like every page, it 404s when the module is
// switched off for the institute or the user lacks the module's permission.
export default async function PaidModulePage({ params }: { params: Promise<{ module: string }> }) {
  const { module: key } = await params;
  if (!isPaidModuleKey(key)) notFound();
  const nav = PAID_MODULE_NAV[key];
  await requireModulePage(nav.permission);

  return (
    <>
      <PageHeader title={nav.label} />
      <EmptyState icon={Construction} title="Coming soon" description={`${nav.label} is switched on for your institute. Its screens are being built.`} />
    </>
  );
}
