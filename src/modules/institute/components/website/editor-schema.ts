import { z } from "zod";
import {
  APPEARANCES, BACKGROUNDS, BODY_FONTS, BUTTON_STYLES, CARD_STYLES, COURSE_LAYOUTS, DENSITIES, FAQ_LAYOUTS, GALLERY_LAYOUTS, MOTION_LEVELS, GRADIENT_CHOICES, HEADER_STYLES, HERO_LAYOUTS,
  HERO_OVERLAYS, NOTICE_LAYOUTS, PALETTE_CHOICES, RADII, SITE_LANGUAGES, TESTIMONIAL_LAYOUTS, TEXT_SIZES, WEBSITE_FONTS, WEBSITE_SECTIONS, WEBSITE_THEMES,
} from "@/server/modules/website/design";
import {
  ANNOUNCEMENT_MAX, FEATURE_ICONS, LINK_LABEL_MAX, MAX_EXTRA_SLIDES, MAX_FAQS, MAX_FEATURES, MAX_STAT_VALUE, MAX_STATS, MAX_VIDEOS, SECTION_SUBTITLE_MAX, SECTION_TITLE_MAX, SOCIAL_NETWORKS,
  youtubeIdOf,
} from "@/server/modules/website/site-content";
import { toCamelCaseKeys } from "@/server/core/http/case";
import type { PublicWebsite } from "@/server/modules/website/public";
import type { WebsiteSettingsBody, WebsiteSettingsRow } from "../../api";

// The website editor's form: the settings as text fields, and their conversion to and from the wire.

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a colour like #1d4ed8.").nullable();
const max = (n: number) => z.string().trim().max(n, `At most ${n} characters.`);

export const editorSchema = z
  .object({
    theme: z.enum(WEBSITE_THEMES),
    heading_font: z.enum(WEBSITE_FONTS),
    design: z.object({
      palette: z.enum(PALETTE_CHOICES),
      custom_primary: hex,
      custom_accent: hex,
      gradient: z.enum(GRADIENT_CHOICES),
      body_font: z.enum(BODY_FONTS),
      text_size: z.enum(TEXT_SIZES),
      radius: z.enum(RADII),
      button_style: z.enum(BUTTON_STYLES),
      card_style: z.enum(CARD_STYLES),
      density: z.enum(DENSITIES),
      background: z.enum(BACKGROUNDS),
      appearance: z.enum(APPEARANCES),
      header_style: z.enum(HEADER_STYLES),
      hero_layout: z.enum(HERO_LAYOUTS),
      hero_overlay: z.enum(HERO_OVERLAYS),
      gallery_layout: z.enum(GALLERY_LAYOUTS),
      testimonial_layout: z.enum(TESTIMONIAL_LAYOUTS),
      course_layout: z.enum(COURSE_LAYOUTS),
      notice_layout: z.enum(NOTICE_LAYOUTS),
      faq_layout: z.enum(FAQ_LAYOUTS),
      motion: z.enum(MOTION_LEVELS),
      language: z.enum(SITE_LANGUAGES),
    }),
    titles: z.record(z.enum(WEBSITE_SECTIONS), z.object({ title: max(SECTION_TITLE_MAX), subtitle: max(SECTION_SUBTITLE_MAX) })),
    announcement: z.object({ text: max(ANNOUNCEMENT_MAX), link_url: max(300), link_label: max(LINK_LABEL_MAX), show_until: z.string() }),
    social: z.object(Object.fromEntries(SOCIAL_NETWORKS.map((n) => [n, max(300)])) as Record<(typeof SOCIAL_NETWORKS)[number], ReturnType<typeof max>>),
    stats: z
      .array(
        z.object({
          value: z.string().trim().regex(/^\d{1,8}$/, "A whole number, e.g. 1200.").refine((v) => Number(v) <= MAX_STAT_VALUE, "That number is too big."),
          suffix: max(4),
          label: max(40).min(1, "Say what the number counts."),
        }),
      )
      .max(MAX_STATS),
    features: z.array(z.object({ icon: z.enum(FEATURE_ICONS), title: max(60).min(1, "Give the reason a title."), text: max(200) })).max(MAX_FEATURES),
    faqs: z.array(z.object({ question: max(150).min(1, "Write the question."), answer: max(1000).min(1, "Write the answer.") })).max(MAX_FAQS),
    videos: z.array(z.object({ url: z.string().trim().refine((v) => !!youtubeIdOf(v), "Paste a YouTube video's address."), title: max(100) })).max(MAX_VIDEOS),
    hero_slides: z.array(z.object({ image_file_id: z.string().min(1, "Choose a picture for this slide."), heading: max(120), subheading: max(250) })).max(MAX_EXTRA_SLIDES),
    show_ticker: z.boolean(),
    sections: z.array(z.object({ key: z.enum(WEBSITE_SECTIONS), enabled: z.boolean(), on_home: z.boolean() })),
    hero_heading: max(120),
    hero_subheading: max(250),
    hero_image_file_id: z.string(),
    hero_button: z.enum(["ENQUIRE", "CALL", "NONE"]),
    about_heading: max(120),
    about_text: max(3000),
    about_image_file_id: z.string(),
  })
  .refine((v) => v.design.palette !== "CUSTOM" || !!v.design.custom_primary, { message: "Choose your main colour.", path: ["design", "custom_primary"] });

export type EditorValues = z.infer<typeof editorSchema>;

const orNull = (v: string) => (v.trim() === "" ? null : v.trim());

export function toEditorValues(s: WebsiteSettingsRow): EditorValues {
  const a = s.content.announcement;
  return {
    theme: s.theme,
    heading_font: s.heading_font,
    design: s.design,
    titles: Object.fromEntries(WEBSITE_SECTIONS.map((k) => [k, { title: s.content.section_titles[k]?.title ?? "", subtitle: s.content.section_titles[k]?.subtitle ?? "" }])) as EditorValues["titles"],
    announcement: { text: a?.text ?? "", link_url: a?.link_url ?? "", link_label: a?.link_label ?? "", show_until: a?.show_until ?? "" },
    social: Object.fromEntries(SOCIAL_NETWORKS.map((n) => [n, s.content.social[n] ?? ""])) as EditorValues["social"],
    stats: s.content.stats.map((x) => ({ value: String(x.value), suffix: x.suffix ?? "", label: x.label })),
    features: s.content.features.map((x) => ({ icon: x.icon, title: x.title, text: x.text ?? "" })),
    faqs: s.content.faqs,
    videos: s.content.videos.map((v) => ({ url: `https://youtu.be/${v.youtube_id}`, title: v.title ?? "" })),
    hero_slides: s.content.hero_slides.map((x) => ({ image_file_id: x.image_file_id, heading: x.heading ?? "", subheading: x.subheading ?? "" })),
    show_ticker: s.content.show_ticker,
    sections: s.sections,
    hero_heading: s.hero_heading ?? "",
    hero_subheading: s.hero_subheading ?? "",
    hero_image_file_id: s.hero_image_file_id ?? "",
    hero_button: s.hero_button,
    about_heading: s.about_heading ?? "",
    about_text: s.about_text ?? "",
    about_image_file_id: s.about_image_file_id ?? "",
  };
}

export function toBody(v: EditorValues): WebsiteSettingsBody {
  const titles = Object.fromEntries(
    Object.entries(v.titles)
      .map(([k, t]) => [k, { title: orNull(t.title), subtitle: orNull(t.subtitle) }] as const)
      .filter(([, t]) => t.title || t.subtitle),
  );
  return {
    theme: v.theme,
    heading_font: v.heading_font,
    design: v.design,
    content: {
      section_titles: titles,
      announcement: orNull(v.announcement.text)
        ? { text: v.announcement.text.trim(), link_url: orNull(v.announcement.link_url), link_label: orNull(v.announcement.link_label), show_until: orNull(v.announcement.show_until) }
        : null,
      social: Object.fromEntries(SOCIAL_NETWORKS.map((n) => [n, orNull(v.social[n])])) as WebsiteSettingsBody["content"]["social"],
      stats: v.stats.map((x) => ({ value: Number(x.value), suffix: orNull(x.suffix), label: x.label.trim() })),
      features: v.features.map((x) => ({ icon: x.icon, title: x.title.trim(), text: orNull(x.text) })),
      faqs: v.faqs.map((x) => ({ question: x.question.trim(), answer: x.answer.trim() })),
      videos: v.videos.map((x) => ({ youtube_id: x.url.trim(), title: orNull(x.title) })),
      hero_slides: v.hero_slides.map((x) => ({ image_file_id: x.image_file_id, heading: orNull(x.heading), subheading: orNull(x.subheading) })),
      show_ticker: v.show_ticker,
    },
    sections: v.sections,
    hero_heading: orNull(v.hero_heading),
    hero_subheading: orNull(v.hero_subheading),
    hero_image_file_id: v.hero_image_file_id || null,
    hero_button: v.hero_button,
    about_heading: orNull(v.about_heading),
    about_text: orNull(v.about_text),
    about_image_file_id: v.about_image_file_id || null,
  };
}

/** The unsaved values as the public site reads its settings, for the live preview. Nothing here is saved. */
export function toPreviewSettings(v: EditorValues): PublicWebsite["settings"] {
  const settings = toCamelCaseKeys<PublicWebsite["settings"]>(toBody(v));
  return {
    ...settings,
    content: {
      ...settings.content,
      stats: settings.content.stats.filter((s) => Number.isFinite(s.value) && s.label),
      features: settings.content.features.filter((f) => f.title),
      faqs: settings.content.faqs.filter((f) => f.question && f.answer),
      videos: v.videos.flatMap((x) => {
        const youtubeId = youtubeIdOf(x.url);
        return youtubeId ? [{ youtubeId, title: orNull(x.title) }] : [];
      }),
      heroSlides: settings.content.heroSlides.filter((x) => x.imageFileId),
    },
  };
}
