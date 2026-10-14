import type { Metadata } from "next";
import type { SitePage } from "@/server/modules/website/design";
import type { PublicWebsite } from "@/server/modules/website/public";
import { SITE_LABELS } from "./i18n";

// Each page's title and link preview (D142), so a page shared on Facebook or found in a search says what it is.

const clip = (text: string, max = 160) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

export function websiteMetadata(site: PublicWebsite, page: SitePage): Metadata {
  const t = SITE_LABELS[site.settings.design.language];
  const name = site.profile.name;
  const title = page === "home" ? name : `${t.page[page]} · ${name}`;
  const own = site.settings.heroSubheading ?? site.settings.aboutText;
  const description = clip((page === "home" ? own : t.pageLine[page]) ?? own ?? name);
  const image = site.settings.heroImageFileId ?? site.settings.aboutImageFileId;
  return {
    // The institute's own site: its name only, without the product's name that the app's title template adds.
    title: { absolute: title },
    description,
    openGraph: { title, description, type: "website", siteName: name, ...(image ? { images: [`/api/public/website-images/${image}`] } : {}) },
  };
}
