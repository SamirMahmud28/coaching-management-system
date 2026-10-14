import { THEME_PRESETS, type PaletteChoice, type WebsiteDesign, type WebsiteFont, type WebsiteTheme } from "@/server/modules/website/design";

// Ready-made looks (D146): complete styles in one click, a theme with its preset, a palette and a few signature
// touches. The owner can change anything afterwards; a look never touches the language or the website's words.

export interface Look {
  id: string;
  label: string;
  description: string;
  theme: WebsiteTheme;
  palette: Exclude<PaletteChoice, "BRAND" | "CUSTOM">;
  headingFont?: WebsiteFont;
  design?: Partial<Omit<WebsiteDesign, "palette" | "customPrimary" | "customAccent" | "language">>;
}

export const LOOKS: Look[] = [
  { id: "padma-classic", label: "Padma Classic", description: "Calm teal and amber; trusted and clear.", theme: "CLASSIC", palette: "PADMA" },
  { id: "jamdani-royal", label: "Jamdani Royal", description: "Deep indigo with gold, serif headings and a Nakshi Kantha background.", theme: "CLASSIC", palette: "JAMDANI", headingFont: "PLAYFAIR", design: { background: "NAKSHI" } },
  { id: "lal-sabuj", label: "Lal-Sabuj Bold", description: "The flag's green and red in a bold banner.", theme: "BOLD", palette: "LAL_SABUJ" },
  { id: "bangla-first", label: "Bangla First", description: "Bangla fonts for headings and text, warm and readable.", theme: "MODERN", palette: "PADMA", headingFont: "ANEK_BANGLA", design: { bodyFont: "HIND_SILIGURI" } },
  { id: "heritage-green", label: "Heritage Green", description: "Forest green, serif and Alpana: dignified and traditional.", theme: "ELEGANT", palette: "FOREST", design: { background: "ALPANA" } },
  { id: "shapla-elegant", label: "Shapla Elegant", description: "Water-lily pink and green, refined and gentle.", theme: "ELEGANT", palette: "SHAPLA" },
  { id: "medical-prep", label: "Medical Prep Blue", description: "Clean ocean blue with soft shadows, for medical admission coaching.", theme: "MODERN", palette: "OCEAN" },
  { id: "engineering-night", label: "Engineering Night", description: "Dark, glowing indigo with a fine grid, for engineering admission.", theme: "MIDNIGHT", palette: "INDIGO" },
  { id: "board-topper", label: "Board Topper", description: "Tidy emerald tiles that show off results.", theme: "BENTO", palette: "EMERALD" },
  { id: "admission-rush", label: "Admission Rush", description: "Coral gradients and lively motion for admission season.", theme: "VIBRANT", palette: "CORAL", design: { gradient: "SUNRISE" } },
  { id: "kids-playful", label: "Kids Playful", description: "Rounded, sunny and dotted: made for young learners.", theme: "PLAYFUL", palette: "SUNSET" },
  { id: "sky-glass", label: "Sky Glass", description: "Frosted glass over a soft sky gradient.", theme: "GLASS", palette: "SKY", design: { gradient: "OCEAN_BREEZE" } },
  { id: "aurora-dream", label: "Aurora Dream", description: "Glowing colour clouds and a gradient heading.", theme: "AURORA", palette: "FUCHSIA" },
  { id: "clean-slate", label: "Clean Slate", description: "Minimal slate grey with lots of white space.", theme: "MINIMAL", palette: "SLATE" },
  { id: "night-minimal", label: "Night Minimal", description: "Minimal and always dark, with a gold accent.", theme: "MINIMAL", palette: "CHARCOAL", design: { appearance: "DARK" } },
  { id: "saffron-pop", label: "Saffron Pop", description: "Thick outlines, hard shadows and saffron: impossible to miss.", theme: "NEO_BRUTAL", palette: "SAFFRON" },
  { id: "krishnachura", label: "Krishnachura", description: "Flame-tree orange with a strong banner.", theme: "BOLD", palette: "KRISHNACHURA" },
  { id: "lagoon-modern", label: "Lagoon Modern", description: "Fresh cyan and lime, airy and modern.", theme: "MODERN", palette: "LAGOON" },
  { id: "heritage-gold", label: "Heritage Gold", description: "Brown and gold with an Alpana background; classic and warm.", theme: "ELEGANT", palette: "HERITAGE", design: { background: "ALPANA" } },
  { id: "violet-vibrant", label: "Violet Vibrant", description: "Violet and cyan gradients with lively motion.", theme: "VIBRANT", palette: "VIOLET" },
];

/** A look applied on top of the current design: the theme's preset, then the look's palette and touches. */
export function applyLook(look: Look, current: WebsiteDesign): { theme: WebsiteTheme; headingFont: WebsiteFont; design: WebsiteDesign } {
  const { headingFont, ...preset } = THEME_PRESETS[look.theme];
  return {
    theme: look.theme,
    headingFont: look.headingFont ?? headingFont,
    design: { ...current, ...preset, ...look.design, palette: look.palette, customPrimary: null, customAccent: null },
  };
}
