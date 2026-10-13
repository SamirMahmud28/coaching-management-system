import { eq } from "drizzle-orm";
import { WEBSITE_SECTIONS, websiteSettings, type WebsiteSectionKey, type WebsiteSectionSetting } from "../../core/db/schema";
import { inTransaction } from "../../core/db/transaction";
import type { DbOrTx } from "../../core/db/types";
import { assertFileReference } from "../../core/files/service";
import { ValidationError } from "../../core/errors";
import { audit } from "../audit/service";
import {
  APPEARANCES, BACKGROUNDS, BODY_FONTS, BUTTON_STYLES, CARD_STYLES, DENSITIES, GRADIENT_CHOICES, HEX_COLOUR, PALETTE_CHOICES, RADII, TEXT_SIZES,
  WEBSITE_FONTS, WEBSITE_THEMES, completeDesign, legacyDesign, type WebsiteDesign, type WebsiteFont, type WebsiteTheme,
} from "./design";

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
  design: legacyDesign("CLASSIC"),
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
  if (!row) return { ...DEFAULTS, design: legacyDesign("CLASSIC"), sections: DEFAULT_SECTIONS.map((s) => ({ ...s })) };
  return {
    theme: row.theme,
    headingFont: row.headingFont,
    design: completeDesign(row.design, legacyDesign(row.theme)),
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
  };
  if (design.palette === "CUSTOM" && !design.customPrimary) {
    throw new ValidationError("VALIDATION_COLOUR", "Choose your main colour for the custom palette.", { field: "design.customPrimary" });
  }
  return design;
}

/** Every section exactly once, in the order given. */
function cleanSections(sections: WebsiteSectionSetting[]): WebsiteSectionSetting[] {
  const keys = sections.map((s) => s.key);
  const valid = keys.length === WEBSITE_SECTIONS.length && WEBSITE_SECTIONS.every((k) => keys.includes(k));
  if (!valid) throw new ValidationError("VALIDATION_WEBSITE_SECTIONS", "List every section exactly once.", { field: "sections" });
  return sections.map((s) => ({ key: s.key as WebsiteSectionKey, enabled: !!s.enabled }));
}

const valuesOf = (s: WebsiteSettings): WebsiteSettingsInput => ({
  theme: s.theme, headingFont: s.headingFont, design: s.design, sections: s.sections, heroHeading: s.heroHeading, heroSubheading: s.heroSubheading,
  heroImageFileId: s.heroImageFileId, heroButton: s.heroButton, aboutHeading: s.aboutHeading, aboutText: s.aboutText, aboutImageFileId: s.aboutImageFileId,
});

/** Saves the whole look at once; it is public immediately (D126). Audited. */
export async function saveWebsiteSettings(db: DbOrTx, actor: Actor, input: WebsiteSettingsInput): Promise<WebsiteSettings> {
  const values = {
    theme: oneOf(input.theme, WEBSITE_THEMES, "theme", "Choose one of the themes."),
    headingFont: oneOf(input.headingFont, WEBSITE_FONTS, "headingFont", "Choose one of the fonts."),
    design: cleanDesign(input.design),
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
