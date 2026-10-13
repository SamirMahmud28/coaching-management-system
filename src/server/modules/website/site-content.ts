import { WEBSITE_SECTIONS, type WebsiteSectionKey } from "./design";

// The website's own words beyond the banner and About (D138, D140): renamed section headings, the announcement bar and
// social links. Pure data, shared by validation, the editor and the public site.

export const SOCIAL_NETWORKS = ["facebook", "youtube", "instagram", "tiktok", "linkedin"] as const;
export type SocialNetwork = (typeof SOCIAL_NETWORKS)[number];

/** The hosts a link to each network may point at (D138); anything else is refused. */
export const SOCIAL_HOSTS: Record<SocialNetwork, readonly string[]> = {
  facebook: ["facebook.com", "fb.com", "fb.me"],
  youtube: ["youtube.com", "youtu.be"],
  instagram: ["instagram.com"],
  tiktok: ["tiktok.com"],
  linkedin: ["linkedin.com"],
};

export const SECTION_TITLE_MAX = 80;
export const SECTION_SUBTITLE_MAX = 200;
export const ANNOUNCEMENT_MAX = 160;
export const LINK_LABEL_MAX = 30;

export interface SectionTitle {
  title: string | null;
  subtitle: string | null;
}

export interface Announcement {
  text: string;
  /** An https link, or an in-page link such as `#enquiry`. */
  linkUrl: string | null;
  linkLabel: string | null;
  /** The last day it is shown (YYYY-MM-DD, Dhaka); none shows it until it is removed. */
  showUntil: string | null;
}

export interface WebsiteContent {
  sectionTitles: Partial<Record<WebsiteSectionKey, SectionTitle>>;
  announcement: Announcement | null;
  social: Record<SocialNetwork, string | null>;
}

export const DEFAULT_CONTENT: WebsiteContent = {
  sectionTitles: {},
  announcement: null,
  social: { facebook: null, youtube: null, instagram: null, tiktok: null, linkedin: null },
};

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v : null);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/** A stored content object with every part present; anything malformed is dropped rather than shown. */
export function completeContent(stored: unknown): WebsiteContent {
  const s = obj(stored);
  const titles = obj(s.sectionTitles);
  const sectionTitles: WebsiteContent["sectionTitles"] = {};
  for (const key of WEBSITE_SECTIONS) {
    const t = obj(titles[key]);
    const title = str(t.title);
    const subtitle = str(t.subtitle);
    if (title || subtitle) sectionTitles[key] = { title, subtitle };
  }
  const a = obj(s.announcement);
  const announcement = str(a.text) ? { text: a.text as string, linkUrl: str(a.linkUrl), linkLabel: str(a.linkLabel), showUntil: str(a.showUntil) } : null;
  const social = obj(s.social);
  return { sectionTitles, announcement, social: Object.fromEntries(SOCIAL_NETWORKS.map((n) => [n, str(social[n])])) as WebsiteContent["social"] };
}

/** `https://…` for a link typed without a scheme; null when it isn't a web address on one of `hosts`. */
export function normaliseLink(value: string, hosts?: readonly string[]): string | null {
  const v = value.trim();
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(v) ? v : `https://${v}`);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (!url.hostname.includes(".")) return null;
  if (hosts) {
    const host = url.hostname.toLowerCase().replace(/^(www|m|web)\./, "");
    if (!hosts.some((h) => host === h || host.endsWith(`.${h}`))) return null;
  }
  url.protocol = "https:";
  return url.toString();
}
