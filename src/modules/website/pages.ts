import { SECTION_PAGE, SITE_PAGES, type SitePage, type WebsiteSectionKey } from "@/server/modules/website/design";
import type { PublicWebsite } from "@/server/modules/website/public";

// Which sections and pages the public website shows. Pure, so the page route (404s, titles) and the
// renderer agree.

/** Whether a section has anything to show; an empty one is left out together with its link. */
export function hasContent(key: WebsiteSectionKey, site: PublicWebsite): boolean {
  const { settings: s, profile } = site;
  switch (key) {
    case "ABOUT":
      return !!(s.aboutText || s.aboutImageFileId);
    case "COURSES":
      return site.courses.length > 0;
    case "CONTACT":
      return !!(profile.address || profile.phone || profile.email || profile.website);
    case "NOTICES":
      return site.notices.length > 0;
    case "GALLERY":
      return site.gallery.length > 0;
    case "TESTIMONIALS":
      return site.testimonials.length > 0;
    case "ENQUIRY":
      return true;
    case "STATS":
      return s.content.stats.length > 0;
    case "FEATURES":
      return s.content.features.length > 0;
    case "FACULTY":
      return site.faculty.length > 0;
    case "ACHIEVERS":
      return site.achievers.length > 0;
    case "VIDEO":
      return s.content.videos.length > 0;
    case "FAQ":
      return s.content.faqs.length > 0;
  }
}

/** The sections a page shows, in the site's order: Home shows those marked "On Home", every other page its own. */
export function sectionsOn(site: PublicWebsite, page: SitePage): WebsiteSectionKey[] {
  return site.settings.sections
    .filter((s) => s.enabled && (page === "home" ? s.onHome : SECTION_PAGE[s.key] === page) && hasContent(s.key, site))
    .map((s) => s.key);
}

/** The pages in the menu: Home always, then every page with something to show, in the fixed order. */
export function pagesOf(site: PublicWebsite): SitePage[] {
  return SITE_PAGES.filter((p) => p === "home" || sectionsOn(site, p).length > 0);
}

export const pageHref = (page: SitePage) => (page === "home" ? "/" : `/${page}`);

/** A link to a section: on this page when it is shown here, else on its own page (old one-page links keep working). */
export function sectionHref(site: PublicWebsite, current: SitePage, key: WebsiteSectionKey): string | null {
  if (!site.settings.sections.some((s) => s.key === key && s.enabled) || !hasContent(key, site)) return null;
  if (sectionsOn(site, current).includes(key)) return `#${key.toLowerCase()}`;
  return `${pageHref(SECTION_PAGE[key])}#${key.toLowerCase()}`;
}

/** An in-page link the office wrote (e.g. the announcement's `#enquiry`), pointed at wherever that section now is. */
export function resolveLink(site: PublicWebsite, current: SitePage, link: string): string {
  if (!link.startsWith("#")) return link;
  const key = link.slice(1).toUpperCase() as WebsiteSectionKey;
  return (SECTION_PAGE[key] && sectionHref(site, current, key)) ?? "/";
}
