import type { WebsiteTheme } from "@/server/modules/website/design";

// Each theme's signature: how section headings look, how alternate sections are tinted, and the welcome
// banner's composition. Colours, fonts, shapes and spacing come from the design settings, so a theme combines with any
// palette.

/** The welcome banner's composition. */
export type HeroKind = "CENTRED" | "SPLIT" | "BANNER" | "GRADIENT" | "MINIMAL" | "AURORA" | "GLASS" | "BENTO" | "BRUTAL";
/** The mark under a section heading. */
export type HeadingMark = "BAR" | "LINE" | "DOTS" | "GRADIENT" | "BLOCK" | "NONE";

export interface ThemeSignature {
  align: "center" | "left";
  /** Classes for section titles. */
  title: string;
  /** Classes for the banner's main heading. */
  heroTitle: string;
  mark: HeadingMark;
  /** Classes for every other section's background. */
  band: string;
  hero: HeroKind;
  /** Picture shape in the banner and About. */
  media: "rounded" | "blob" | "arch" | "framed";
}

export const THEMES: Record<WebsiteTheme, ThemeSignature> = {
  CLASSIC: { align: "center", title: "text-2xl font-semibold sm:text-3xl", heroTitle: "text-4xl font-semibold tracking-tight sm:text-5xl", mark: "BAR", band: "bg-muted/40", hero: "CENTRED", media: "rounded" },
  MODERN: { align: "left", title: "text-3xl font-bold tracking-tight", heroTitle: "text-4xl font-bold tracking-tight sm:text-5xl", mark: "BAR", band: "site-tint", hero: "SPLIT", media: "rounded" },
  BOLD: {
    align: "left", title: "text-3xl font-extrabold uppercase tracking-tight sm:text-4xl", heroTitle: "text-4xl font-extrabold uppercase leading-tight tracking-tight sm:text-6xl",
    mark: "BLOCK", band: "bg-muted/60", hero: "BANNER", media: "rounded",
  },
  ELEGANT: { align: "center", title: "text-3xl font-normal sm:text-4xl", heroTitle: "text-4xl font-normal leading-tight sm:text-6xl", mark: "LINE", band: "", hero: "CENTRED", media: "arch" },
  PLAYFUL: { align: "center", title: "text-3xl font-bold sm:text-4xl", heroTitle: "text-4xl font-bold leading-tight sm:text-6xl", mark: "DOTS", band: "site-tint-accent", hero: "SPLIT", media: "blob" },
  MINIMAL: { align: "left", title: "text-2xl font-medium tracking-tight sm:text-3xl", heroTitle: "text-5xl font-semibold tracking-tight sm:text-7xl", mark: "NONE", band: "", hero: "MINIMAL", media: "rounded" },
  VIBRANT: { align: "left", title: "text-3xl font-extrabold tracking-tight sm:text-4xl", heroTitle: "text-4xl font-extrabold leading-tight tracking-tight sm:text-6xl", mark: "GRADIENT", band: "site-tint", hero: "GRADIENT", media: "rounded" },
  MIDNIGHT: { align: "left", title: "text-3xl font-bold tracking-tight sm:text-4xl", heroTitle: "text-4xl font-bold leading-tight tracking-tight sm:text-6xl", mark: "GRADIENT", band: "", hero: "AURORA", media: "framed" },
  GLASS: { align: "center", title: "text-3xl font-bold tracking-tight sm:text-4xl", heroTitle: "text-4xl font-bold leading-tight tracking-tight sm:text-6xl", mark: "GRADIENT", band: "", hero: "GLASS", media: "rounded" },
  BENTO: { align: "left", title: "text-3xl font-bold tracking-tight", heroTitle: "text-4xl font-bold leading-tight tracking-tight sm:text-5xl", mark: "NONE", band: "", hero: "BENTO", media: "rounded" },
  AURORA: { align: "center", title: "text-3xl font-bold tracking-tight sm:text-4xl", heroTitle: "text-4xl font-bold leading-tight tracking-tight sm:text-6xl", mark: "GRADIENT", band: "", hero: "AURORA", media: "rounded" },
  NEO_BRUTAL: {
    align: "left", title: "text-3xl font-black uppercase tracking-tight sm:text-4xl", heroTitle: "text-4xl font-black uppercase leading-none tracking-tight sm:text-6xl",
    mark: "BLOCK", band: "site-tint-accent", hero: "BRUTAL", media: "framed",
  },
};
