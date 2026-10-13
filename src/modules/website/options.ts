import type { WebsiteSectionKey } from "@/server/core/db/schema/website";
import { BODY_FONTS } from "@/server/modules/website/design";
import type {
  Appearance, Background, BodyFont, ButtonStyle, CardStyle, Density, PaletteFamily, Radius, TextSize, WebsiteFont, WebsiteTheme,
} from "@/server/modules/website/design";

// Labels shared by the website editor and the public site (D124, D131, D135, D136).

export type { WebsiteFont, WebsiteTheme };
export type HeroButton = "ENQUIRE" | "CALL" | "NONE";

export const THEME_OPTIONS: { value: WebsiteTheme; label: string; description: string }[] = [
  { value: "CLASSIC", label: "Classic", description: "Centred and calm: a soft banner, cards with borders, alternating light bands." },
  { value: "MODERN", label: "Modern", description: "Text beside a large rounded picture, airy spacing, soft tinted bands." },
  { value: "BOLD", label: "Bold", description: "A full-width banner in your main colour, big capital headings, strong accents." },
  { value: "ELEGANT", label: "Elegant", description: "Serif headings, thin lines, arched pictures and outline buttons: refined and quiet." },
  { value: "PLAYFUL", label: "Playful", description: "Rounded shapes, a dotted background and friendly fonts: great for young learners." },
  { value: "MINIMAL", label: "Minimal", description: "A huge heading, lots of white space, a wide picture and nothing extra." },
  { value: "VIBRANT", label: "Vibrant", description: "A colourful gradient banner, gradient buttons and energetic headings." },
  { value: "MIDNIGHT", label: "Midnight", description: "A dark site with glowing colours, glass cards and a fine grid." },
  { value: "GLASS", label: "Glass", description: "Frosted-glass panels floating over soft colour: the modern app look." },
  { value: "BENTO", label: "Bento", description: "Tidy tiles of different sizes, like a bento box: modern and organised." },
  { value: "AURORA", label: "Aurora", description: "Soft glowing colour clouds behind a gradient heading, with glass cards." },
  { value: "NEO_BRUTAL", label: "Neo-brutal", description: "Thick black outlines, hard shadows and loud colour: bold and unforgettable." },
];

export const FONT_OPTIONS: { value: WebsiteFont; label: string; note: string }[] = [
  { value: "INTER", label: "Inter", note: "clean, the app's font" },
  { value: "POPPINS", label: "Poppins", note: "rounded, friendly" },
  { value: "MONTSERRAT", label: "Montserrat", note: "strong, geometric" },
  { value: "OUTFIT", label: "Outfit", note: "modern, soft" },
  { value: "SPACE_GROTESK", label: "Space Grotesk", note: "techy, distinctive" },
  { value: "RALEWAY", label: "Raleway", note: "light, stylish" },
  { value: "NUNITO", label: "Nunito", note: "round, warm" },
  { value: "LATO", label: "Lato", note: "neutral, professional" },
  { value: "OSWALD", label: "Oswald", note: "tall, condensed" },
  { value: "MERRIWEATHER", label: "Merriweather", note: "classic serif" },
  { value: "LORA", label: "Lora", note: "bookish serif" },
  { value: "PLAYFAIR", label: "Playfair Display", note: "elegant serif" },
  { value: "DM_SERIF_DISPLAY", label: "DM Serif Display", note: "dramatic serif" },
  { value: "HIND_SILIGURI", label: "Hind Siliguri", note: "Bangla and English" },
  { value: "ANEK_BANGLA", label: "Anek Bangla", note: "Bangla and English, modern" },
  { value: "BALOO_DA_2", label: "Baloo Da 2", note: "Bangla and English, playful" },
  { value: "NOTO_SERIF_BENGALI", label: "Noto Serif Bengali", note: "Bangla and English, serif" },
  { value: "TIRO_BANGLA", label: "Tiro Bangla", note: "Bangla and English, traditional" },
];

export const BODY_FONT_OPTIONS = FONT_OPTIONS.filter((f): f is { value: BodyFont; label: string; note: string } =>
  (BODY_FONTS as readonly string[]).includes(f.value),
);

export const PALETTE_FAMILY_LABELS: Record<PaletteFamily, string> = {
  BANGLADESH: "Bangladesh",
  BLUE: "Blue",
  GREEN: "Green",
  TEAL: "Teal",
  RED: "Red",
  ORANGE: "Orange",
  GOLD: "Gold & brown",
  PURPLE: "Purple",
  PINK: "Pink",
  NEUTRAL: "Neutral",
};

export const TEXT_SIZE_OPTIONS: { value: TextSize; label: string }[] = [
  { value: "SMALL", label: "Small" },
  { value: "MEDIUM", label: "Medium" },
  { value: "LARGE", label: "Large (easier to read)" },
];

export const RADIUS_OPTIONS: { value: Radius; label: string }[] = [
  { value: "NONE", label: "Square" },
  { value: "SMALL", label: "Slightly rounded" },
  { value: "MEDIUM", label: "Rounded" },
  { value: "LARGE", label: "Very rounded" },
  { value: "FULL", label: "Pill buttons" },
];

export const BUTTON_STYLE_OPTIONS: { value: ButtonStyle; label: string }[] = [
  { value: "SOLID", label: "Solid" },
  { value: "GRADIENT", label: "Gradient" },
  { value: "OUTLINE", label: "Outline" },
  { value: "SOFT", label: "Soft" },
  { value: "BRUTAL", label: "Hard shadow" },
];

export const CARD_STYLE_OPTIONS: { value: CardStyle; label: string }[] = [
  { value: "BORDER", label: "Thin border" },
  { value: "SHADOW", label: "Soft shadow" },
  { value: "FLAT", label: "Flat tint" },
  { value: "GLASS", label: "Frosted glass" },
  { value: "BRUTAL", label: "Thick outline" },
];

export const DENSITY_OPTIONS: { value: Density; label: string }[] = [
  { value: "COMPACT", label: "Compact" },
  { value: "COMFORTABLE", label: "Comfortable" },
  { value: "SPACIOUS", label: "Spacious" },
];

export const BACKGROUND_OPTIONS: { value: Background; label: string }[] = [
  { value: "PLAIN", label: "Plain" },
  { value: "GRADIENT", label: "Colour glow" },
  { value: "DOTS", label: "Dots" },
  { value: "GRID", label: "Grid" },
  { value: "WAVES", label: "Waves" },
  { value: "NAKSHI", label: "Nakshi Kantha" },
  { value: "ALPANA", label: "Alpana" },
];

export const APPEARANCE_OPTIONS: { value: Appearance; label: string; description: string }[] = [
  { value: "VISITOR", label: "Visitor's choice", description: "Follows each visitor's phone or computer, with a light/dark switch." },
  { value: "LIGHT", label: "Always light", description: "No switch." },
  { value: "DARK", label: "Always dark", description: "No switch." },
];

export const HERO_BUTTON_OPTIONS: { value: HeroButton; label: string }[] = [
  { value: "ENQUIRE", label: "Enquire — goes to the admission enquiry form" },
  { value: "CALL", label: "Call — dials the institute's phone number" },
  { value: "NONE", label: "No button" },
];

/** Section names: `label` in the editor, `nav` in the website's menu. */
export const SECTION_LABELS: Record<WebsiteSectionKey, { label: string; nav: string; source: string }> = {
  ABOUT: { label: "About", nav: "About", source: "The heading, text and picture below." },
  COURSES: { label: "Courses & batches", nav: "Courses", source: "Your active courses, subjects and class times (Courses)." },
  NOTICES: { label: "Notices", nav: "Notices", source: "Your website notices." },
  GALLERY: { label: "Gallery", nav: "Gallery", source: "Your gallery photos." },
  TESTIMONIALS: { label: "Testimonials", nav: "Testimonials", source: "Your testimonials." },
  ENQUIRY: { label: "Admission enquiry form", nav: "Admission", source: "Visitors send their name, mobile number and course." },
  CONTACT: { label: "Contact & map", nav: "Contact", source: "Address, phone and email from Institute Settings, with a map of the address." },
};
