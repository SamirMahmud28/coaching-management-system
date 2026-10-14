import { eq } from "drizzle-orm";
import { WEBSITE_SECTIONS, websiteSettings, type WebsiteSectionKey, type WebsiteSectionSetting } from "../../core/db/schema";
import { inTransaction } from "../../core/db/transaction";
import type { DbOrTx } from "../../core/db/types";
import { assertFileReference } from "../../core/files/service";
import { ValidationError } from "../../core/errors";
import { audit } from "../audit/service";
import {
  APPEARANCES, BACKGROUNDS, BODY_FONTS, BUTTON_STYLES, CARD_STYLES, COURSE_LAYOUTS, DENSITIES, FAQ_LAYOUTS, GALLERY_LAYOUTS, GRADIENT_CHOICES, HEADER_STYLES, HERO_LAYOUTS,
  HERO_OVERLAYS, HEX_COLOUR, NOTICE_LAYOUTS, PALETTE_CHOICES, RADII, SITE_LANGUAGES, TESTIMONIAL_LAYOUTS, TEXT_SIZES, WEBSITE_FONTS, WEBSITE_THEMES,
  completeDesign, legacyDesign, type WebsiteDesign, type WebsiteFont, type WebsiteTheme,
  HOME_DEFAULT,
} from "./design";
import {
  ANNOUNCEMENT_MAX, DEFAULT_CONTENT, FEATURE_ICONS, LINK_LABEL_MAX, MAX_FAQS, MAX_FEATURES, MAX_STAT_VALUE, MAX_STATS, SECTION_SUBTITLE_MAX, SECTION_TITLE_MAX,
  SOCIAL_HOSTS, SOCIAL_NETWORKS, completeContent, normaliseLink, youtubeIdOf, type WebsiteContent,
} from "./site-content";

// The website's look and fixed content (D124, D126, D131, D135, D136): theme, heading font, the design settings, the
// sections below the hero (on/off and order), and the hero and about texts and pictures. Every save is public at once
// (D126).

export { WEBSITE_FONTS, WEBSITE_THEMES, type WebsiteFont, type WebsiteTheme };
export const HERO_BUTTONS = ["ENQUIRE", "CALL", "NONE"] as const;

export type HeroButton = (typeof HERO_BUTTONS)[number];

export interface Actor {
  tenantId: string;
  userId: string;
}

export interface WebsiteSettings {
  theme: WebsiteTheme;
  headingFont: WebsiteFont;
  design: WebsiteDesign;
  content: WebsiteContent;
  sections: WebsiteSectionSetting[];
  heroHeading: string | null;
  heroSubheading: string | null;
  heroImageFileId: string | null;
  heroButton: HeroButton;
  aboutHeading: string | null;
  aboutText: string | null;
  aboutImageFileId: string | null;
  /** True until the first save. */
  isDefault: boolean;
  updatedAt: Date | null;
}

export type WebsiteSettingsInput = Omit<WebsiteSettings, "isDefault" | "updatedAt">;

export const DEFAULT_SECTIONS: WebsiteSectionSetting[] = WEBSITE_SECTIONS.map((key) => ({ key, enabled: true, onHome: HOME_DEFAULT.includes(key) }));

const DEFAULTS: WebsiteSettings = {
  theme: "CLASSIC",
  headingFont: "INTER",
  design: legacyDesign("CLASSIC"),
  content: DEFAULT_CONTENT,
  sections: DEFAULT_SECTIONS,
  heroHeading: null,
  heroSubheading: null,
  heroImageFileId: null,
  heroButton: "ENQUIRE",
  aboutHeading: null,
  aboutText: null,
  aboutImageFileId: null,
  isDefault: true,
  updatedAt: null,
};

/**
 * Stored sections in their saved order. A section added to the product later than the institute's last save is put in
 * its natural place, after the section that comes before it in the product's order, and switched on (it stays hidden
 * while it has nothing to show), so an old row always lists every section exactly once.
 */
function completeSections(stored: WebsiteSectionSetting[]): WebsiteSectionSetting[] {
  const result = stored
    .filter((s, i) => WEBSITE_SECTIONS.includes(s.key) && stored.findIndex((o) => o.key === s.key) === i)
    // A row saved before pages existed has no Home choice: it gets the default Home set (D143).
    .map((s) => ({ key: s.key, enabled: !!s.enabled, onHome: typeof s.onHome === "boolean" ? s.onHome : HOME_DEFAULT.includes(s.key) }));
  WEBSITE_SECTIONS.forEach((key, order) => {
    if (result.some((s) => s.key === key)) return;
    const before = WEBSITE_SECTIONS.slice(0, order).findLast((k) => result.some((s) => s.key === k));
    result.splice(before ? result.findIndex((s) => s.key === before) + 1 : 0, 0, { key, enabled: true, onHome: HOME_DEFAULT.includes(key) });
  });
  return result;
}

export async function getWebsiteSettings(db: DbOrTx, tenantId: string): Promise<WebsiteSettings> {
  const [row] = await db.select().from(websiteSettings).where(eq(websiteSettings.tenantId, tenantId));
  if (!row) return { ...DEFAULTS, design: legacyDesign("CLASSIC"), sections: DEFAULT_SECTIONS.map((s) => ({ ...s })) };
  return {
    theme: row.theme,
    headingFont: row.headingFont,
    design: completeDesign(row.design, legacyDesign(row.theme)),
    content: completeContent(row.content),
    sections: completeSections(row.sections),
    heroHeading: row.heroHeading,
    heroSubheading: row.heroSubheading,
    heroImageFileId: row.heroImageFileId,
    heroButton: row.heroButton,
    aboutHeading: row.aboutHeading,
    aboutText: row.aboutText,
    aboutImageFileId: row.aboutImageFileId,
    isDefault: false,
    updatedAt: row.updatedAt,
  };
}

function text(value: string | null | undefined, max: number, field: string, label: string): string | null {
  const v = value?.trim() ?? "";
  if (v.length > max) throw new ValidationError("VALIDATION_TEXT", `${label} can be at most ${max} characters.`, { field });
  return v === "" ? null : v;
}

function oneOf<T extends string>(value: string, allowed: readonly T[], field: string, message: string): T {
  if (!(allowed as readonly string[]).includes(value)) throw new ValidationError("VALIDATION_CHOICE", message, { field });
  return value as T;
}

function hexColour(value: string | null | undefined, field: string): string | null {
  if (value == null || value === "") return null;
  const v = value.trim().toLowerCase();
  if (!HEX_COLOUR.test(v)) throw new ValidationError("VALIDATION_COLOUR", "Use a colour like #1d4ed8.", { field });
  return v;
}

/** Every design setting from its allowed list (D135, D136); custom colours are required for the Custom palette. */
function cleanDesign(d: WebsiteDesign): WebsiteDesign {
  const choice = "Choose one of the options.";
  const design: WebsiteDesign = {
    palette: oneOf(d.palette, PALETTE_CHOICES, "design.palette", "Choose one of the colour palettes."),
    customPrimary: hexColour(d.customPrimary, "design.customPrimary"),
    customAccent: hexColour(d.customAccent, "design.customAccent"),
    gradient: oneOf(d.gradient, GRADIENT_CHOICES, "design.gradient", "Choose one of the gradients."),
    bodyFont: oneOf(d.bodyFont, BODY_FONTS, "design.bodyFont", "Choose one of the text fonts."),
    textSize: oneOf(d.textSize, TEXT_SIZES, "design.textSize", choice),
    radius: oneOf(d.radius, RADII, "design.radius", choice),
    buttonStyle: oneOf(d.buttonStyle, BUTTON_STYLES, "design.buttonStyle", choice),
    cardStyle: oneOf(d.cardStyle, CARD_STYLES, "design.cardStyle", choice),
    density: oneOf(d.density, DENSITIES, "design.density", choice),
    background: oneOf(d.background, BACKGROUNDS, "design.background", choice),
    appearance: oneOf(d.appearance, APPEARANCES, "design.appearance", choice),
    headerStyle: oneOf(d.headerStyle, HEADER_STYLES, "design.headerStyle", choice),
    heroLayout: oneOf(d.heroLayout, HERO_LAYOUTS, "design.heroLayout", choice),
    heroOverlay: oneOf(d.heroOverlay, HERO_OVERLAYS, "design.heroOverlay", choice),
    galleryLayout: oneOf(d.galleryLayout, GALLERY_LAYOUTS, "design.galleryLayout", choice),
    testimonialLayout: oneOf(d.testimonialLayout, TESTIMONIAL_LAYOUTS, "design.testimonialLayout", choice),
    courseLayout: oneOf(d.courseLayout, COURSE_LAYOUTS, "design.courseLayout", choice),
    noticeLayout: oneOf(d.noticeLayout, NOTICE_LAYOUTS, "design.noticeLayout", choice),
    faqLayout: oneOf(d.faqLayout, FAQ_LAYOUTS, "design.faqLayout", choice),
    language: oneOf(d.language, SITE_LANGUAGES, "design.language", "Choose English or Bangla."),
  };
  if (design.palette === "CUSTOM" && !design.customPrimary) {
    throw new ValidationError("VALIDATION_COLOUR", "Choose your main colour for the custom palette.", { field: "design.customPrimary" });
  }
  return design;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** A link the office typed: https on any site, or an in-page link to one of the sections (`#enquiry`). */
function link(value: string | null | undefined, field: string, hosts?: readonly string[], message = "Use a web address such as https://example.com."): string | null {
  const v = value?.trim() ?? "";
  if (v === "") return null;
  if (!hosts && /^#[a-z]+$/.test(v) && (WEBSITE_SECTIONS as readonly string[]).includes(v.slice(1).toUpperCase())) return v;
  const url = v.length <= 300 ? normaliseLink(v, hosts) : null;
  if (!url) throw new ValidationError("VALIDATION_LINK", message, { field });
  return url;
}

/** Section titles, the announcement bar and social links (D138, D140). */
function cleanContent(c: WebsiteContent): WebsiteContent {
  const sectionTitles: WebsiteContent["sectionTitles"] = {};
  for (const [key, t] of Object.entries(c.sectionTitles ?? {})) {
    if (!(WEBSITE_SECTIONS as readonly string[]).includes(key)) throw new ValidationError("VALIDATION_CHOICE", "Unknown section.", { field: "content.sectionTitles" });
    const title = text(t?.title, SECTION_TITLE_MAX, `content.sectionTitles.${key}.title`, "A section heading");
    const subtitle = text(t?.subtitle, SECTION_SUBTITLE_MAX, `content.sectionTitles.${key}.subtitle`, "A line under a heading");
    if (title || subtitle) sectionTitles[key as WebsiteSectionKey] = { title, subtitle };
  }
  let announcement: WebsiteContent["announcement"] = null;
  const a = c.announcement;
  const announcementText = text(a?.text, ANNOUNCEMENT_MAX, "content.announcement.text", "The announcement");
  if (a && announcementText) {
    const showUntil = a.showUntil?.trim() || null;
    if (showUntil && (!ISO_DATE.test(showUntil) || Number.isNaN(Date.parse(`${showUntil}T00:00:00Z`)))) {
      throw new ValidationError("VALIDATION_DATE", "Use a date such as 2026-12-31.", { field: "content.announcement.showUntil" });
    }
    const linkUrl = link(a.linkUrl, "content.announcement.linkUrl");
    announcement = { text: announcementText, linkUrl, linkLabel: linkUrl ? text(a.linkLabel, LINK_LABEL_MAX, "content.announcement.linkLabel", "The link's words") : null, showUntil };
  }
  const social = Object.fromEntries(
    SOCIAL_NETWORKS.map((n) => [n, link(c.social?.[n], `content.social.${n}`, SOCIAL_HOSTS[n], `Use your ${n === "tiktok" ? "TikTok" : n === "youtube" ? "YouTube" : n === "linkedin" ? "LinkedIn" : n[0].toUpperCase() + n.slice(1)} page's address.`)]),
  ) as WebsiteContent["social"];
  const most = <T,>(items: T[] | undefined, n: number, field: string, what: string): T[] => {
    if ((items?.length ?? 0) > n) throw new ValidationError("VALIDATION_TOO_MANY", `At most ${n} ${what}.`, { field });
    return items ?? [];
  };
  const stats = most(c.stats, MAX_STATS, "content.stats", "numbers").map((x, i) => {
    const value = Number(x.value);
    if (!Number.isInteger(value) || value < 0 || value > MAX_STAT_VALUE) {
      throw new ValidationError("VALIDATION_NUMBER", `Use a whole number from 0 to ${MAX_STAT_VALUE.toLocaleString("en-US")}.`, { field: `content.stats.${i}.value` });
    }
    return { value, suffix: text(x.suffix, 4, `content.stats.${i}.suffix`, "The sign after the number"), label: required(x.label, 40, `content.stats.${i}.label`, "What the number counts") };
  });
  const features = most(c.features, MAX_FEATURES, "content.features", "reasons").map((x, i) => ({
    icon: oneOf(x.icon, FEATURE_ICONS, `content.features.${i}.icon`, "Choose one of the icons."),
    title: required(x.title, 60, `content.features.${i}.title`, "The title"),
    text: text(x.text, 200, `content.features.${i}.text`, "The text"),
  }));
  const faqs = most(c.faqs, MAX_FAQS, "content.faqs", "questions").map((x, i) => ({
    question: required(x.question, 150, `content.faqs.${i}.question`, "The question"),
    answer: required(x.answer, 1000, `content.faqs.${i}.answer`, "The answer"),
  }));
  let video: WebsiteContent["video"] = null;
  if (c.video?.youtubeId?.trim()) {
    const youtubeId = youtubeIdOf(c.video.youtubeId);
    if (!youtubeId) throw new ValidationError("VALIDATION_LINK", "Paste a YouTube video's address, e.g. https://youtu.be/…", { field: "content.video.youtubeId" });
    video = { youtubeId, title: text(c.video.title, 100, "content.video.title", "The video's title") };
  }
  return { sectionTitles, announcement, social, stats, features, faqs, video };
}

function required(value: string | null | undefined, max: number, field: string, label: string): string {
  const v = text(value, max, field, label);
  if (!v) throw new ValidationError("VALIDATION_REQUIRED", `${label} is required.`, { field });
  return v;
}

/** Every section exactly once, in the order given. */
function cleanSections(sections: WebsiteSectionSetting[]): WebsiteSectionSetting[] {
  const keys = sections.map((s) => s.key);
  const valid = keys.length === WEBSITE_SECTIONS.length && WEBSITE_SECTIONS.every((k) => keys.includes(k));
  if (!valid) throw new ValidationError("VALIDATION_WEBSITE_SECTIONS", "List every section exactly once.", { field: "sections" });
  return sections.map((s) => ({ key: s.key as WebsiteSectionKey, enabled: !!s.enabled, onHome: !!s.onHome }));
}

const valuesOf = (s: WebsiteSettings): WebsiteSettingsInput => ({
  theme: s.theme, headingFont: s.headingFont, design: s.design, content: s.content, sections: s.sections, heroHeading: s.heroHeading, heroSubheading: s.heroSubheading,
  heroImageFileId: s.heroImageFileId, heroButton: s.heroButton, aboutHeading: s.aboutHeading, aboutText: s.aboutText, aboutImageFileId: s.aboutImageFileId,
});

/** Saves the whole look at once; it is public immediately (D126). Audited. */
export async function saveWebsiteSettings(db: DbOrTx, actor: Actor, input: WebsiteSettingsInput): Promise<WebsiteSettings> {
  const values = {
    theme: oneOf(input.theme, WEBSITE_THEMES, "theme", "Choose one of the themes."),
    headingFont: oneOf(input.headingFont, WEBSITE_FONTS, "headingFont", "Choose one of the fonts."),
    design: cleanDesign(input.design),
    content: cleanContent(input.content ?? DEFAULT_CONTENT),
    sections: cleanSections(input.sections),
    heroHeading: text(input.heroHeading, 120, "heroHeading", "The heading"),
    heroSubheading: text(input.heroSubheading, 250, "heroSubheading", "The subheading"),
    heroImageFileId: input.heroImageFileId || null,
    heroButton: oneOf(input.heroButton, HERO_BUTTONS, "heroButton", "Choose what the button does."),
    aboutHeading: text(input.aboutHeading, 120, "aboutHeading", "The heading"),
    aboutText: text(input.aboutText, 3000, "aboutText", "The text"),
    aboutImageFileId: input.aboutImageFileId || null,
  };
  return inTransaction(db, async (tx) => {
    if (values.heroImageFileId) await assertFileReference(tx, actor.tenantId, values.heroImageFileId, "WEBSITE_IMAGE", "heroImageFileId");
    if (values.aboutImageFileId) await assertFileReference(tx, actor.tenantId, values.aboutImageFileId, "WEBSITE_IMAGE", "aboutImageFileId");
    const before = await getWebsiteSettings(tx, actor.tenantId);
    const now = new Date();
    await tx
      .insert(websiteSettings)
      .values({ tenantId: actor.tenantId, ...values, updatedAt: now, updatedBy: actor.userId })
      .onConflictDoUpdate({ target: websiteSettings.tenantId, set: { ...values, updatedAt: now, updatedBy: actor.userId } });
    await audit.record(tx, {
      tenantId: actor.tenantId,
      actorType: "TENANT_USER",
      userId: actor.userId,
      action: "WEBSITE_UPDATED",
      resourceType: "WEBSITE",
      oldValue: before.isDefault ? undefined : valuesOf(before),
      newValue: values,
    });
    return { ...values, isDefault: false, updatedAt: now };
  });
}
