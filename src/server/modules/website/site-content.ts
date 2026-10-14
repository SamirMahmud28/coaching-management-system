import { WEBSITE_SECTIONS, type WebsiteSectionKey } from "./design";

// The website's own words beyond the banner and About (D138, D140): renamed section headings, the announcement bar,
// social links, and the Stats, Why choose us, FAQ and Video sections. Pure data, shared by validation, the editor and
// the public site.

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

export const MAX_STATS = 6;
export const MAX_FEATURES = 8;
export const MAX_FAQS = 20;
/** Banner slides besides the main banner (D147): the main banner is always the first slide. */
export const MAX_EXTRA_SLIDES = 4;
export const MAX_VIDEOS = 12;
/** The largest number a counter shows (e.g. students taught). */
export const MAX_STAT_VALUE = 10_000_000;

/** Icons offered for "Why choose us" (D138): lucide icon names, drawn by the public site. */
export const FEATURE_ICONS = [
  "GraduationCap", "BookOpen", "Users", "Trophy", "Clock", "Target", "Award", "Brain", "FlaskConical", "Calculator", "Laptop", "ClipboardCheck",
  "ShieldCheck", "Smile", "Star", "HeartHandshake", "Lightbulb", "MapPin", "Wallet", "Bus", "Microscope", "PenTool", "MessageCircle", "BadgeCheck",
] as const;
export type FeatureIcon = (typeof FEATURE_ICONS)[number];

export interface Stat {
  value: number;
  /** Shown after the number, e.g. "+" or "%". */
  suffix: string | null;
  label: string;
}

export interface Feature {
  icon: FeatureIcon;
  title: string;
  text: string | null;
}

export interface Faq {
  question: string;
  answer: string;
}

export interface Video {
  /** The 11-character YouTube id; the address is rebuilt from it, so nothing else can be embedded. */
  youtubeId: string;
  title: string | null;
}

export interface HeroSlide {
  imageFileId: string;
  heading: string | null;
  subheading: string | null;
}

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
  stats: Stat[];
  features: Feature[];
  faqs: Faq[];
  /** The video gallery (D147), in order. */
  videos: Video[];
  /** Extra banner slides (D147); with any, the banner becomes a photo slider. */
  heroSlides: HeroSlide[];
  /** The moving strip of achievers under the Home banner (D147). */
  showTicker: boolean;
}

export const DEFAULT_CONTENT: WebsiteContent = {
  sectionTitles: {},
  announcement: null,
  social: { facebook: null, youtube: null, instagram: null, tiktok: null, linkedin: null },
  stats: [],
  features: [],
  faqs: [],
  videos: [],
  heroSlides: [],
  showTicker: false,
};

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;

/** The video id of a YouTube address (watch, youtu.be, shorts, embed or live links), or null. */
export function youtubeIdOf(value: string): string | null {
  const v = value.trim();
  if (YOUTUBE_ID.test(v)) return v;
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase().replace(/^(www|m|music)\./, "");
  let id: string | null = null;
  if (host === "youtu.be") id = url.pathname.split("/")[1] ?? null;
  else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    const [, kind, rest] = url.pathname.split("/");
    id = kind === "watch" ? url.searchParams.get("v") : ["shorts", "embed", "live", "v"].includes(kind) ? (rest ?? null) : null;
  }
  return id && YOUTUBE_ID.test(id) ? id : null;
}

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
  const list = (v: unknown) => (Array.isArray(v) ? v.map(obj) : []);
  const stats = list(s.stats)
    .filter((x) => typeof x.value === "number" && Number.isFinite(x.value) && str(x.label))
    .slice(0, MAX_STATS)
    .map((x) => ({ value: x.value as number, suffix: str(x.suffix), label: x.label as string }));
  const features = list(s.features)
    .filter((x) => str(x.title))
    .slice(0, MAX_FEATURES)
    .map((x) => ({ icon: (FEATURE_ICONS as readonly unknown[]).includes(x.icon) ? (x.icon as FeatureIcon) : "Star", title: x.title as string, text: str(x.text) }));
  const faqs = list(s.faqs)
    .filter((x) => str(x.question) && str(x.answer))
    .slice(0, MAX_FAQS)
    .map((x) => ({ question: x.question as string, answer: x.answer as string }));
  const asVideo = (v: Record<string, unknown>) => (typeof v.youtubeId === "string" && YOUTUBE_ID.test(v.youtubeId) ? { youtubeId: v.youtubeId, title: str(v.title) } : null);
  // A site saved before the video gallery had one video: it becomes the first.
  const storedVideos = Array.isArray(s.videos) ? list(s.videos) : s.video ? [obj(s.video)] : [];
  const videos = storedVideos.map(asVideo).filter((v): v is Video => !!v).slice(0, MAX_VIDEOS);
  const heroSlides = list(s.heroSlides)
    .filter((x) => typeof x.imageFileId === "string" && x.imageFileId)
    .slice(0, MAX_EXTRA_SLIDES)
    .map((x) => ({ imageFileId: x.imageFileId as string, heading: str(x.heading), subheading: str(x.subheading) }));
  return {
    sectionTitles,
    announcement,
    social: Object.fromEntries(SOCIAL_NETWORKS.map((n) => [n, str(social[n])])) as WebsiteContent["social"],
    stats,
    features,
    faqs,
    videos,
    heroSlides,
    showTicker: s.showTicker === true,
  };
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
