import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { InstituteWebsite } from "@/modules/website/components/institute-website";
import { websiteMetadata } from "@/modules/website/metadata";
import { pagesOf } from "@/modules/website/pages";
import { SITE_PAGES, type SitePage } from "@/server/modules/website/design";
import { getCurrentInstitute } from "@/server/modules/institute/current-user";
import { publicPageVisible } from "@/server/modules/portal/service";
import { loadPublicWebsite } from "@/server/modules/website/load";

// The website's other pages: /about, /courses, /teachers, /results, /gallery, /notices, /admission, /contact.
// Only while the Website module is on and the institute's page is shown, and only a page with something to
// show; anything else is 404. /login and /app are their own routes and take precedence.

type Props = { params: Promise<{ page: string }> };

async function load(slug: string) {
  if (slug === "home" || !(SITE_PAGES as readonly string[]).includes(slug)) return null;
  const institute = await getCurrentInstitute();
  if (!publicPageVisible(institute.status)) return null;
  const site = await loadPublicWebsite(institute.id);
  const page = slug as SitePage;
  return site && pagesOf(site).includes(page) ? { site, page } : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const found = await load((await params).page);
  return found ? websiteMetadata(found.site, found.page) : { title: "Not found" };
}

export default async function WebsitePage({ params }: Props) {
  const found = await load((await params).page);
  if (!found) notFound();
  return <InstituteWebsite site={found.site} page={found.page} />;
}
