// The website's design catalogue (D135, D136): themes and their presets, colour palettes, gradients, fonts and the
// other look settings. Pure data with no server imports, so the editor and the public site share it with validation.

export const WEBSITE_THEMES = ["CLASSIC", "MODERN", "BOLD", "ELEGANT", "PLAYFUL", "MINIMAL", "VIBRANT", "MIDNIGHT", "GLASS", "BENTO", "AURORA", "NEO_BRUTAL"] as const;
export const WEBSITE_FONTS = [
  "INTER", "POPPINS", "MERRIWEATHER", "PLAYFAIR", "HIND_SILIGURI",
  "MONTSERRAT", "LATO", "NUNITO", "RALEWAY", "OUTFIT", "SPACE_GROTESK", "LORA", "DM_SERIF_DISPLAY", "OSWALD",
  "NOTO_SERIF_BENGALI", "TIRO_BANGLA", "BALOO_DA_2", "ANEK_BANGLA",
] as const;
/** Fonts comfortable for paragraphs; display faces (Playfair, DM Serif, Oswald, Tiro, Baloo) are headings only. */
export const BODY_FONTS = ["INTER", "POPPINS", "LATO", "NUNITO", "MONTSERRAT", "RALEWAY", "OUTFIT", "LORA", "MERRIWEATHER", "HIND_SILIGURI", "ANEK_BANGLA", "NOTO_SERIF_BENGALI"] as const;

export type WebsiteTheme = (typeof WEBSITE_THEMES)[number];
export type WebsiteFont = (typeof WEBSITE_FONTS)[number];
export type BodyFont = (typeof BODY_FONTS)[number];

// --- colour (D136) ------------------------------------------------------------------------------------------------

export const PALETTE_FAMILIES = ["BANGLADESH", "BLUE", "GREEN", "TEAL", "RED", "ORANGE", "GOLD", "PURPLE", "PINK", "NEUTRAL"] as const;
export type PaletteFamily = (typeof PALETTE_FAMILIES)[number];

export interface Palette {
  id: string;
  family: PaletteFamily;
  label: string;
  primary: string;
  accent: string;
}

/** Curated palettes. Text colours are derived for readability (see `src/modules/website/tokens.ts`), light and dark. */
export const PALETTES = [
  { id: "LAL_SABUJ", family: "BANGLADESH", label: "Lal-Sabuj (flag)", primary: "#006a4e", accent: "#f42a41" },
  { id: "JAMDANI", family: "BANGLADESH", label: "Jamdani", primary: "#1e3a5f", accent: "#c9a227" },
  { id: "PADMA", family: "BANGLADESH", label: "Padma river", primary: "#0e7490", accent: "#f59e0b" },
  { id: "KRISHNACHURA", family: "BANGLADESH", label: "Krishnachura", primary: "#c2410c", accent: "#15803d" },
  { id: "SHAPLA", family: "BANGLADESH", label: "Shapla", primary: "#be185d", accent: "#059669" },
  { id: "OCEAN", family: "BLUE", label: "Ocean", primary: "#1d4ed8", accent: "#0ea5e9" },
  { id: "ROYAL", family: "BLUE", label: "Royal", primary: "#1e3a8a", accent: "#f59e0b" },
  { id: "SKY", family: "BLUE", label: "Sky", primary: "#0284c7", accent: "#22d3ee" },
  { id: "INDIGO", family: "BLUE", label: "Indigo", primary: "#4338ca", accent: "#ec4899" },
  { id: "FOREST", family: "GREEN", label: "Forest", primary: "#166534", accent: "#ca8a04" },
  { id: "EMERALD", family: "GREEN", label: "Emerald", primary: "#059669", accent: "#0ea5e9" },
  { id: "MINT", family: "GREEN", label: "Mint", primary: "#10b981", accent: "#6366f1" },
  { id: "OLIVE", family: "GREEN", label: "Olive", primary: "#4d7c0f", accent: "#b45309" },
  { id: "TEAL", family: "TEAL", label: "Teal", primary: "#0f766e", accent: "#f97316" },
  { id: "LAGOON", family: "TEAL", label: "Lagoon", primary: "#0891b2", accent: "#a3e635" },
  { id: "CRIMSON", family: "RED", label: "Crimson", primary: "#b91c1c", accent: "#f59e0b" },
  { id: "ROSE", family: "RED", label: "Rose", primary: "#e11d48", accent: "#7c3aed" },
  { id: "MAROON", family: "RED", label: "Maroon", primary: "#7f1d1d", accent: "#d4a017" },
  { id: "SUNSET", family: "ORANGE", label: "Sunset", primary: "#ea580c", accent: "#db2777" },
  { id: "AMBER", family: "ORANGE", label: "Amber", primary: "#d97706", accent: "#1e40af" },
  { id: "CORAL", family: "ORANGE", label: "Coral", primary: "#f97316", accent: "#0ea5e9" },
  { id: "HERITAGE", family: "GOLD", label: "Heritage", primary: "#92400e", accent: "#ca8a04" },
  { id: "SAFFRON", family: "GOLD", label: "Saffron", primary: "#ca8a04", accent: "#7c2d12" },
  { id: "VIOLET", family: "PURPLE", label: "Violet", primary: "#7c3aed", accent: "#06b6d4" },
  { id: "PLUM", family: "PURPLE", label: "Plum", primary: "#6b21a8", accent: "#f472b6" },
  { id: "LAVENDER", family: "PURPLE", label: "Lavender", primary: "#8b5cf6", accent: "#f59e0b" },
  { id: "BLOSSOM", family: "PINK", label: "Blossom", primary: "#db2777", accent: "#8b5cf6" },
  { id: "FUCHSIA", family: "PINK", label: "Fuchsia", primary: "#c026d3", accent: "#22d3ee" },
  { id: "SLATE", family: "NEUTRAL", label: "Slate", primary: "#334155", accent: "#0ea5e9" },
  { id: "CHARCOAL", family: "NEUTRAL", label: "Charcoal", primary: "#18181b", accent: "#eab308" },
  { id: "STONE", family: "NEUTRAL", label: "Stone", primary: "#57534e", accent: "#ea580c" },
] as const satisfies readonly Palette[];

/** `BRAND` uses the colour from Institute Settings (the default, D136); `CUSTOM` uses the two colours chosen. */
export const PALETTE_CHOICES = ["BRAND", "CUSTOM", ...PALETTES.map((p) => p.id)] as const;
export type PaletteChoice = (typeof PALETTE_CHOICES)[number];

export interface Gradient {
  id: string;
  label: string;
  stops: readonly string[];
}

export const GRADIENTS = [
  { id: "SUNRISE", label: "Sunrise", stops: ["#f97316", "#ec4899"] },
  { id: "OCEAN_BREEZE", label: "Ocean breeze", stops: ["#0ea5e9", "#6366f1"] },
  { id: "FOREST_DEW", label: "Forest dew", stops: ["#15803d", "#0d9488"] },
  { id: "ROYAL_NIGHT", label: "Royal night", stops: ["#1e3a8a", "#7c3aed"] },
  { id: "CANDY", label: "Candy", stops: ["#ec4899", "#8b5cf6", "#06b6d4"] },
  { id: "PEACH", label: "Peach", stops: ["#fb923c", "#f472b6"] },
  { id: "AURORA", label: "Aurora", stops: ["#22d3ee", "#a78bfa", "#f472b6"] },
  { id: "EMBER", label: "Ember", stops: ["#dc2626", "#f59e0b"] },
  { id: "LIME_SPLASH", label: "Lime splash", stops: ["#65a30d", "#0891b2"] },
  { id: "MIDNIGHT_CITY", label: "Midnight city", stops: ["#0f172a", "#334155", "#6366f1"] },
  { id: "GOLDEN_HOUR", label: "Golden hour", stops: ["#f59e0b", "#ef4444"] },
  { id: "BANGLADESH", label: "Bangladesh", stops: ["#006a4e", "#f42a41"] },
] as const satisfies readonly Gradient[];

/** `AUTO` blends the palette's primary into its accent. */
export const GRADIENT_CHOICES = ["AUTO", ...GRADIENTS.map((g) => g.id)] as const;
export type GradientChoice = (typeof GRADIENT_CHOICES)[number];

// --- shapes, spacing and background (D135) ------------------------------------------------------------------------

export const TEXT_SIZES = ["SMALL", "MEDIUM", "LARGE"] as const;
export const RADII = ["NONE", "SMALL", "MEDIUM", "LARGE", "FULL"] as const;
export const BUTTON_STYLES = ["SOLID", "GRADIENT", "OUTLINE", "SOFT", "BRUTAL"] as const;
export const CARD_STYLES = ["BORDER", "SHADOW", "FLAT", "GLASS", "BRUTAL"] as const;
export const DENSITIES = ["COMPACT", "COMFORTABLE", "SPACIOUS"] as const;
export const BACKGROUNDS = ["PLAIN", "GRADIENT", "DOTS", "GRID", "WAVES", "NAKSHI", "ALPANA"] as const;
/** `VISITOR` follows the visitor's device and shows the light/dark switch; the others fix the look. */
export const APPEARANCES = ["VISITOR", "LIGHT", "DARK"] as const;

export type TextSize = (typeof TEXT_SIZES)[number];
export type Radius = (typeof RADII)[number];
export type ButtonStyle = (typeof BUTTON_STYLES)[number];
export type CardStyle = (typeof CARD_STYLES)[number];
export type Density = (typeof DENSITIES)[number];
export type Background = (typeof BACKGROUNDS)[number];
export type Appearance = (typeof APPEARANCES)[number];

/** Everything about the look except the theme and heading font, which have their own columns. */
export interface WebsiteDesign {
  palette: PaletteChoice;
  customPrimary: string | null;
  customAccent: string | null;
  gradient: GradientChoice;
  bodyFont: BodyFont;
  textSize: TextSize;
  radius: Radius;
  buttonStyle: ButtonStyle;
  cardStyle: CardStyle;
  density: Density;
  background: Background;
  appearance: Appearance;
}

/** What "Apply this theme's defaults" sets. The palette is the institute's identity, so it is left alone. */
export type ThemePreset = { headingFont: WebsiteFont } & Omit<WebsiteDesign, "palette" | "customPrimary" | "customAccent">;

export const THEME_PRESETS: Record<WebsiteTheme, ThemePreset> = {
  CLASSIC: { headingFont: "INTER", bodyFont: "INTER", gradient: "AUTO", textSize: "MEDIUM", radius: "MEDIUM", buttonStyle: "SOLID", cardStyle: "BORDER", density: "COMFORTABLE", background: "PLAIN", appearance: "VISITOR" },
  MODERN: { headingFont: "POPPINS", bodyFont: "INTER", gradient: "AUTO", textSize: "MEDIUM", radius: "LARGE", buttonStyle: "SOLID", cardStyle: "SHADOW", density: "SPACIOUS", background: "PLAIN", appearance: "VISITOR" },
  BOLD: { headingFont: "MONTSERRAT", bodyFont: "INTER", gradient: "AUTO", textSize: "MEDIUM", radius: "SMALL", buttonStyle: "SOLID", cardStyle: "BORDER", density: "COMFORTABLE", background: "PLAIN", appearance: "VISITOR" },
  ELEGANT: { headingFont: "PLAYFAIR", bodyFont: "LORA", gradient: "AUTO", textSize: "MEDIUM", radius: "NONE", buttonStyle: "OUTLINE", cardStyle: "BORDER", density: "SPACIOUS", background: "PLAIN", appearance: "VISITOR" },
  PLAYFUL: { headingFont: "BALOO_DA_2", bodyFont: "NUNITO", gradient: "AUTO", textSize: "LARGE", radius: "FULL", buttonStyle: "SOLID", cardStyle: "SHADOW", density: "COMFORTABLE", background: "DOTS", appearance: "VISITOR" },
  MINIMAL: { headingFont: "INTER", bodyFont: "INTER", gradient: "AUTO", textSize: "MEDIUM", radius: "SMALL", buttonStyle: "OUTLINE", cardStyle: "FLAT", density: "SPACIOUS", background: "PLAIN", appearance: "VISITOR" },
  VIBRANT: { headingFont: "OUTFIT", bodyFont: "POPPINS", gradient: "AUTO", textSize: "MEDIUM", radius: "LARGE", buttonStyle: "GRADIENT", cardStyle: "SHADOW", density: "COMFORTABLE", background: "GRADIENT", appearance: "VISITOR" },
  MIDNIGHT: { headingFont: "SPACE_GROTESK", bodyFont: "INTER", gradient: "AUTO", textSize: "MEDIUM", radius: "MEDIUM", buttonStyle: "GRADIENT", cardStyle: "GLASS", density: "COMFORTABLE", background: "GRID", appearance: "DARK" },
  GLASS: { headingFont: "OUTFIT", bodyFont: "INTER", gradient: "AURORA", textSize: "MEDIUM", radius: "LARGE", buttonStyle: "SOFT", cardStyle: "GLASS", density: "COMFORTABLE", background: "GRADIENT", appearance: "VISITOR" },
  BENTO: { headingFont: "SPACE_GROTESK", bodyFont: "INTER", gradient: "AUTO", textSize: "MEDIUM", radius: "LARGE", buttonStyle: "SOLID", cardStyle: "FLAT", density: "COMPACT", background: "PLAIN", appearance: "VISITOR" },
  AURORA: { headingFont: "POPPINS", bodyFont: "INTER", gradient: "AURORA", textSize: "MEDIUM", radius: "LARGE", buttonStyle: "GRADIENT", cardStyle: "GLASS", density: "SPACIOUS", background: "GRADIENT", appearance: "VISITOR" },
  NEO_BRUTAL: { headingFont: "SPACE_GROTESK", bodyFont: "INTER", gradient: "AUTO", textSize: "MEDIUM", radius: "NONE", buttonStyle: "BRUTAL", cardStyle: "BRUTAL", density: "COMFORTABLE", background: "PLAIN", appearance: "VISITOR" },
};

/**
 * The look of a site that has never changed its design: the brand colour and Classic-like shapes, so that every site
 * saved before Website Pro looks as it did.
 */
export const DEFAULT_DESIGN: WebsiteDesign = {
  palette: "BRAND",
  customPrimary: null,
  customAccent: null,
  gradient: "AUTO",
  bodyFont: "INTER",
  textSize: "MEDIUM",
  radius: "MEDIUM",
  buttonStyle: "SOLID",
  cardStyle: "BORDER",
  density: "COMFORTABLE",
  background: "PLAIN",
  appearance: "VISITOR",
};

/** Before Website Pro, each theme fixed its card look; a stored row without a design keeps that look. */
export function legacyDesign(theme: WebsiteTheme): WebsiteDesign {
  if (theme === "MODERN") return { ...DEFAULT_DESIGN, radius: "LARGE", cardStyle: "SHADOW" };
  if (theme === "BOLD") return { ...DEFAULT_DESIGN, radius: "SMALL" };
  return { ...DEFAULT_DESIGN };
}

export const HEX_COLOUR = /^#[0-9a-f]{6}$/;

const pick = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T => (typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : fallback);
const hex = (value: unknown): string | null => (typeof value === "string" && HEX_COLOUR.test(value.toLowerCase()) ? value.toLowerCase() : null);

/**
 * A stored design with every setting present: unknown or missing values fall back to `base` (a setting added to the
 * product later than the institute's last save gets its default), and unknown keys are dropped.
 */
export function completeDesign(stored: unknown, base: WebsiteDesign = DEFAULT_DESIGN): WebsiteDesign {
  const s = (stored && typeof stored === "object" ? stored : {}) as Record<string, unknown>;
  return {
    palette: pick(s.palette, PALETTE_CHOICES, base.palette),
    customPrimary: hex(s.customPrimary) ?? base.customPrimary,
    customAccent: hex(s.customAccent) ?? base.customAccent,
    gradient: pick(s.gradient, GRADIENT_CHOICES, base.gradient),
    bodyFont: pick(s.bodyFont, BODY_FONTS, base.bodyFont),
    textSize: pick(s.textSize, TEXT_SIZES, base.textSize),
    radius: pick(s.radius, RADII, base.radius),
    buttonStyle: pick(s.buttonStyle, BUTTON_STYLES, base.buttonStyle),
    cardStyle: pick(s.cardStyle, CARD_STYLES, base.cardStyle),
    density: pick(s.density, DENSITIES, base.density),
    background: pick(s.background, BACKGROUNDS, base.background),
    appearance: pick(s.appearance, APPEARANCES, base.appearance),
  };
}

export const paletteById = (id: string): Palette | undefined => PALETTES.find((p) => p.id === id);
export const gradientById = (id: string): Gradient | undefined => GRADIENTS.find((g) => g.id === id);
