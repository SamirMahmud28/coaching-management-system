import { eq } from "drizzle-orm";
import { WEBSITE_SECTIONS, websiteSettings, type WebsiteSectionKey, type WebsiteSectionSetting } from "../../core/db/schema";
import { inTransaction } from "../../core/db/transaction";
import type { DbOrTx } from "../../core/db/types";
import { assertFileReference } from "../../core/files/service";
import { ValidationError } from "../../core/errors";
import { audit } from "../audit/service";

// The website's look and fixed content (D124, D126, D131): theme, heading font, the sections below the hero (on/off and
// order), and the hero and about texts and pictures. Every save is public at once (D126).

export const WEBSITE_THEMES = ["CLASSIC", "MODERN", "BOLD"] as const;
export const WEBSITE_FONTS = ["INTER", "POPPINS", "MERRIWEATHER", "PLAYFAIR", "HIND_SILIGURI"] as const;
export const HERO_BUTTONS = ["ENQUIRE", "CALL", "NONE"] as const;

export type WebsiteTheme = (typeof WEBSITE_THEMES)[number];
export type WebsiteFont = (typeof WEBSITE_FONTS)[number];
export type HeroButton = (typeof HERO_BUTTONS)[number];

export interface Actor {
  tenantId: string;
  userId: string;
}

export interface WebsiteSettings {
  theme: WebsiteTheme;
  headingFont: WebsiteFont;
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

export const DEFAULT_SECTIONS: WebsiteSectionSetting[] = WEBSITE_SECTIONS.map((key) => ({ key, enabled: true }));

const DEFAULTS: WebsiteSettings = {
  theme: "CLASSIC",
  headingFont: "INTER",
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
 * Stored sections in their saved order. A section added to the product later than the institute's last save is
 * appended (switched on), so an old row always lists every section exactly once.
 */
function completeSections(stored: WebsiteSectionSetting[]): WebsiteSectionSetting[] {
  const known = stored.filter((s, i) => WEBSITE_SECTIONS.includes(s.key) && stored.findIndex((o) => o.key === s.key) === i);
  const missing = WEBSITE_SECTIONS.filter((key) => !known.some((s) => s.key === key)).map((key) => ({ key, enabled: true }));
  return [...known.map((s) => ({ key: s.key, enabled: !!s.enabled })), ...missing];
}

export async function getWebsiteSettings(db: DbOrTx, tenantId: string): Promise<WebsiteSettings> {
  const [row] = await db.select().from(websiteSettings).where(eq(websiteSettings.tenantId, tenantId));
  if (!row) return { ...DEFAULTS, sections: DEFAULT_SECTIONS.map((s) => ({ ...s })) };
  return {
    theme: row.theme,
    headingFont: row.headingFont,
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

/** Every section exactly once, in the order given. */
function cleanSections(sections: WebsiteSectionSetting[]): WebsiteSectionSetting[] {
  const keys = sections.map((s) => s.key);
  const valid = keys.length === WEBSITE_SECTIONS.length && WEBSITE_SECTIONS.every((k) => keys.includes(k));
  if (!valid) throw new ValidationError("VALIDATION_WEBSITE_SECTIONS", "List every section exactly once.", { field: "sections" });
  return sections.map((s) => ({ key: s.key as WebsiteSectionKey, enabled: !!s.enabled }));
}

const valuesOf = (s: WebsiteSettings): WebsiteSettingsInput => ({
  theme: s.theme, headingFont: s.headingFont, sections: s.sections, heroHeading: s.heroHeading, heroSubheading: s.heroSubheading,
  heroImageFileId: s.heroImageFileId, heroButton: s.heroButton, aboutHeading: s.aboutHeading, aboutText: s.aboutText, aboutImageFileId: s.aboutImageFileId,
});

/** Saves the whole look at once; it is public immediately (D126). Audited. */
export async function saveWebsiteSettings(db: DbOrTx, actor: Actor, input: WebsiteSettingsInput): Promise<WebsiteSettings> {
  const values = {
    theme: oneOf(input.theme, WEBSITE_THEMES, "theme", "Choose one of the themes."),
    headingFont: oneOf(input.headingFont, WEBSITE_FONTS, "headingFont", "Choose one of the fonts."),
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
