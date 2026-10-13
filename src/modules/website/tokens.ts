import type { CSSProperties } from "react";
import { gradientById, paletteById, type WebsiteDesign } from "@/server/modules/website/design";

// Turns the design settings (D135, D136) into CSS variables on the website's root element. Colours used as text are
// darkened (light mode) or lightened (dark mode) until they read clearly on the page, so every palette, brand colour or
// custom colour stays legible (WCAG AA, 4.5:1).

export const FALLBACK_BRAND = "#2563eb";
/** The page backgrounds of the light and dark themes (`globals.css`). */
export const LIGHT_BG = "#ffffff";
export const DARK_BG = "#020617";
const INK_LIGHT = "#111827";
const INK_WHITE = "#ffffff";

type Rgb = [number, number, number];

const toRgb = (hex: string): Rgb => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as Rgb;
const toHex = (rgb: Rgb) => `#${rgb.map((c) => Math.round(Math.min(255, Math.max(0, c))).toString(16).padStart(2, "0")).join("")}`;

function luminance(hex: string): number {
  const [r, g, b] = toRgb(hex).map((c) => c / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** `amount` (0–1) of the way from `from` to `to`. */
export function mix(from: string, to: string, amount: number): string {
  const [a, b] = [toRgb(from), toRgb(to)];
  return toHex(a.map((c, i) => c + (b[i] - c) * amount) as Rgb);
}

/**
 * Near-black or white, whichever reads better on `bg`. For mid-tone colours where neither reaches AA (4.5:1), pure black
 * does: black or white always reaches at least 4.58:1 on any colour.
 */
export function textOn(bg: string): string {
  const best = contrast(INK_LIGHT, bg) >= contrast(INK_WHITE, bg) ? INK_LIGHT : INK_WHITE;
  return contrast(best, bg) >= 4.5 ? best : "#000000";
}

/** The readable text colour over every stop of a gradient: the one whose weakest contrast is strongest. */
export function textOnAll(stops: readonly string[]): string {
  const worst = (ink: string) => Math.min(...stops.map((s) => contrast(ink, s)));
  return worst(INK_LIGHT) >= worst(INK_WHITE) ? INK_LIGHT : INK_WHITE;
}

/** `colour` moved towards black or white (whichever is further from `bg`) until it reaches `ratio` against `bg`. */
export function ensureContrast(colour: string, bg: string, ratio = 4.5): string {
  if (contrast(colour, bg) >= ratio) return colour;
  const target = luminance(bg) > 0.5 ? "#000000" : "#ffffff";
  for (let step = 1; step <= 20; step++) {
    const c = mix(colour, target, step / 20);
    if (contrast(c, bg) >= ratio) return c;
  }
  return target;
}

export interface SiteColours {
  primary: string;
  accent: string;
  gradient: readonly string[];
}

/** The site's colours from its palette choice: a curated palette, custom colours, or the Settings brand colour. */
export function siteColours(design: WebsiteDesign, brandColour: string | null): SiteColours {
  const brand = brandColour ?? FALLBACK_BRAND;
  const palette = paletteById(design.palette);
  let primary: string;
  let accent: string;
  if (palette) [primary, accent] = [palette.primary, palette.accent];
  else if (design.palette === "CUSTOM" && design.customPrimary) [primary, accent] = [design.customPrimary, design.customAccent ?? mix(design.customPrimary, "#f59e0b", 0.6)];
  else [primary, accent] = [brand, mix(brand, "#f59e0b", 0.6)];
  const preset = gradientById(design.gradient);
  return { primary, accent, gradient: preset ? preset.stops : [primary, accent] };
}

const RADIUS: Record<WebsiteDesign["radius"], [card: string, button: string]> = {
  NONE: ["0px", "0px"],
  SMALL: ["0.375rem", "0.375rem"],
  MEDIUM: ["0.75rem", "0.5rem"],
  LARGE: ["1.5rem", "0.875rem"],
  FULL: ["1.75rem", "9999px"],
};
const SECTION_SPACE: Record<WebsiteDesign["density"], [mobile: string, desktop: string]> = {
  COMPACT: ["2.5rem", "3.5rem"],
  COMFORTABLE: ["3.5rem", "5rem"],
  SPACIOUS: ["4.5rem", "7rem"],
};
/** Applied as a zoom on the root font size, so every `rem` on the site scales together. */
export const TEXT_SCALE: Record<WebsiteDesign["textSize"], string> = { SMALL: "93.75%", MEDIUM: "100%", LARGE: "112.5%" };

/** CSS variables for the site root. Light and dark text colours are both set; `website.css` picks one per mode. */
export function siteVariables(design: WebsiteDesign, brandColour: string | null, headingFamily: string, bodyFamily: string): CSSProperties {
  const { primary, accent, gradient } = siteColours(design, brandColour);
  const [cardRadius, buttonRadius] = RADIUS[design.radius];
  const [spaceMobile, spaceDesktop] = SECTION_SPACE[design.density];
  return {
    "--site-primary": primary,
    "--site-on-primary": textOn(primary),
    "--site-accent": accent,
    "--site-on-accent": textOn(accent),
    "--site-primary-ink-light": ensureContrast(primary, LIGHT_BG),
    "--site-primary-ink-dark": ensureContrast(primary, DARK_BG),
    "--site-accent-ink-light": ensureContrast(accent, LIGHT_BG),
    "--site-accent-ink-dark": ensureContrast(accent, DARK_BG),
    "--site-gradient": `linear-gradient(135deg, ${gradient.join(", ")})`,
    "--site-on-gradient": textOnAll(gradient),
    "--site-gradient-a": gradient[0],
    "--site-gradient-b": gradient[gradient.length - 1],
    "--site-radius": cardRadius,
    "--site-button-radius": buttonRadius,
    "--site-space": spaceMobile,
    "--site-space-lg": spaceDesktop,
    "--site-heading": headingFamily,
    "--site-body": bodyFamily,
    // The name the W1–W4 markup used for the main colour.
    "--site-brand": primary,
    "--site-on-brand": textOn(primary),
  } as CSSProperties;
}
