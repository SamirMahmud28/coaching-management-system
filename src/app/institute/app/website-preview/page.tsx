import type { Metadata } from "next";
import { WebsitePreview } from "@/modules/website/components/website-preview";
import { db } from "@/server/core/db/client";
import { requireModulePage } from "@/server/modules/institute/current-user";
import { getPublicWebsite } from "@/server/modules/website/public";
import { notFound } from "next/navigation";

export const metadata: Metadata = { title: "Website preview" };

// The live preview inside the website editor (D144): the institute's website without the office app's shell, redrawn
// with the editor's unsaved values as they change. Same guard as the editor (website.manage, module on).
export default async function WebsitePreviewPage() {
  const ctx = await requireModulePage("website.manage");
  const site = await getPublicWebsite(db, ctx.session.tenant.id);
  if (!site) notFound();
  return <WebsitePreview site={site} />;
}
