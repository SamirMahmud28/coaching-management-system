import type { WebsiteSectionKey } from "@/server/core/db/schema/website";

// Labels shared by the website editor and the public site (D124, D131).

export type WebsiteTheme = "CLASSIC" | "MODERN" | "BOLD";
export type WebsiteFont = "INTER" | "POPPINS" | "MERRIWEATHER" | "PLAYFAIR" | "HIND_SILIGURI";
export type HeroButton = "ENQUIRE" | "CALL" | "NONE";

export const THEME_OPTIONS: { value: WebsiteTheme; label: string; description: string }[] = [
  { value: "CLASSIC", label: "Classic", description: "Centred and calm: a soft banner, cards with borders, alternating light bands." },
  { value: "MODERN", label: "Modern", description: "Text beside a large rounded picture, airy spacing, soft tinted bands." },
  { value: "BOLD", label: "Bold", description: "A full-width banner in your brand colour, big headings, strong accents." },
];

export const FONT_OPTIONS: { value: WebsiteFont; label: string }[] = [
  { value: "INTER", label: "Inter (the app's font)" },
  { value: "POPPINS", label: "Poppins (rounded, friendly)" },
  { value: "MERRIWEATHER", label: "Merriweather (classic serif)" },
  { value: "PLAYFAIR", label: "Playfair Display (elegant serif)" },
  { value: "HIND_SILIGURI", label: "Hind Siliguri (Bangla and English)" },
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
