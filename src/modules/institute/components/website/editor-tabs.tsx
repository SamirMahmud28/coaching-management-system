"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Pencil } from "lucide-react";
import { Controller, useWatch, type UseFormReturn } from "react-hook-form";
import { FormField } from "@/components/shared/form-field";
import { ImageField } from "@/components/shared/image-field";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { SocialIcon, SOCIAL_LABEL } from "@/modules/website/components/sections/shared";
import { SITE_LABELS } from "@/modules/website/i18n";
import {
  COURSE_LAYOUT_OPTIONS, FAQ_LAYOUT_OPTIONS, GALLERY_LAYOUT_OPTIONS, HEADER_STYLE_OPTIONS, HERO_BUTTON_OPTIONS, HERO_LAYOUT_OPTIONS, HERO_OVERLAY_OPTIONS, LANGUAGE_OPTIONS,
  NOTICE_LAYOUT_OPTIONS, SECTION_LABELS, TESTIMONIAL_LAYOUT_OPTIONS,
} from "@/modules/website/options";
import { THEMES } from "@/modules/website/themes";
import { SECTION_PAGE, type WebsiteDesign } from "@/server/modules/website/design";
import { ANNOUNCEMENT_MAX, SOCIAL_NETWORKS } from "@/server/modules/website/site-content";
import type { WebsiteDesignWire } from "../../api";
import { FaqCard, FeaturesCard, SlidesCard, StatsCard, TickerCard, VideosCard } from "./content-lists";
import { HeroThumb, Segmented } from "./design-controls";
import type { EditorValues } from "./editor-schema";

// The editor's Layout, Content and Sections tabs. The Look tab is in website-editor-page.tsx.

type Form = UseFormReturn<EditorValues>;
type DesignField = <K extends keyof WebsiteDesignWire>(key: K) => { value: WebsiteDesignWire[K]; onChange: (v: WebsiteDesignWire[K]) => void };

const Bar = ({ className }: { className?: string }) => <span className={cn("block rounded-sm bg-foreground/40", className)} />;

/** Tiny drawings of each layout, so the choice is visible before saving. */
const DRAW: Record<string, React.ReactNode> = {
  "header:SOLID": <span className="flex h-6 w-16 items-center gap-1 rounded border px-1"><Bar className="h-1.5 w-4" /><span className="flex-1" /><Bar className="h-1 w-6" /></span>,
  "header:GLASS": <span className="flex h-6 w-16 items-center gap-1 rounded border bg-gradient-to-r from-sky-200/60 to-pink-200/60 px-1 backdrop-blur"><Bar className="h-1.5 w-4" /><span className="flex-1" /><Bar className="h-1 w-6" /></span>,
  "header:CENTRED": <span className="flex h-6 w-16 flex-col items-center justify-center gap-0.5 rounded border"><Bar className="h-1.5 w-5" /><Bar className="h-1 w-10 opacity-60" /></span>,
  "courses:CARDS": <span className="grid w-14 grid-cols-3 gap-0.5">{[0, 1, 2].map((i) => <span key={i} className="h-5 rounded-sm border" />)}</span>,
  "courses:LIST": <span className="flex w-14 flex-col gap-0.5">{[0, 1, 2].map((i) => <span key={i} className="h-1.5 rounded-sm border" />)}</span>,
  "notices:CARDS": <span className="grid w-14 grid-cols-2 gap-0.5">{[0, 1, 2, 3].map((i) => <span key={i} className="h-2.5 rounded-sm border" />)}</span>,
  "notices:TIMELINE": <span className="flex w-14 flex-col gap-1 border-l-2 border-foreground/40 pl-1.5">{[0, 1, 2].map((i) => <Bar key={i} className="h-1 w-8" />)}</span>,
  "gallery:GRID": <span className="grid w-14 grid-cols-4 gap-0.5">{Array.from({ length: 8 }, (_, i) => <span key={i} className="aspect-square rounded-[2px] bg-foreground/25" />)}</span>,
  "gallery:MASONRY": <span className="flex w-14 gap-0.5">{[["h-3", "h-4"], ["h-5", "h-2"], ["h-2", "h-5"], ["h-4", "h-3"]].map((c, i) => <span key={i} className="flex flex-1 flex-col gap-0.5">{c.map((h, j) => <span key={j} className={cn("rounded-[2px] bg-foreground/25", h)} />)}</span>)}</span>,
  "gallery:CAROUSEL": <span className="flex w-14 gap-0.5 overflow-hidden">{[0, 1, 2].map((i) => <span key={i} className="h-6 w-6 shrink-0 rounded-[2px] bg-foreground/25" />)}</span>,
  "testimonials:GRID": <span className="grid w-14 grid-cols-3 gap-0.5">{[0, 1, 2].map((i) => <span key={i} className="h-5 rounded-sm border" />)}</span>,
  "testimonials:CAROUSEL": <span className="flex w-14 gap-0.5 overflow-hidden">{[0, 1, 2].map((i) => <span key={i} className="h-5 w-6 shrink-0 rounded-sm border" />)}</span>,
  "faq:ACCORDION": <span className="flex w-14 flex-col gap-0.5">{[0, 1, 2].map((i) => <span key={i} className="h-1.5 rounded-sm border" />)}</span>,
  "faq:TWO_COLUMN": <span className="grid w-14 grid-cols-2 gap-0.5">{[0, 1, 2, 3].map((i) => <span key={i} className="h-1.5 rounded-sm border" />)}</span>,
  "testimonials:SPOTLIGHT": <span className="flex w-14 flex-col items-center gap-0.5"><Bar className="h-1.5 w-12" /><Bar className="h-1.5 w-9" /><span className="mt-0.5 size-2 rounded-full bg-foreground/40" /></span>,
};

export function LayoutTab({ designField, design, theme, headingFont, brand }: { designField: DesignField; design: WebsiteDesign; theme: EditorValues["theme"]; headingFont: EditorValues["heading_font"]; brand: string | null }) {
  const hero = designField("hero_layout");
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Header</CardTitle>
          <CardDescription>The bar at the top with your name, the menu and Sign in.</CardDescription>
        </CardHeader>
        <CardContent>
          <Segmented label="Header" {...designField("header_style")} options={HEADER_STYLE_OPTIONS} render={(v) => DRAW[`header:${v}`]} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Welcome banner layout</CardTitle>
          <CardDescription>Keep the theme&apos;s own banner, or borrow another theme&apos;s. Each drawing uses your colours and fonts.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div role="radiogroup" aria-label="Banner layout" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {HERO_LAYOUT_OPTIONS.map((o) => (
              <button
                key={o.value}
                type="button"
                role="radio"
                aria-checked={hero.value === o.value}
                onClick={() => hero.onChange(o.value)}
                className={cn("surface-glass-item space-y-1.5 rounded-lg border p-2 text-left text-xs", hero.value === o.value ? "border-primary ring-2 ring-primary/40" : "hover:bg-muted/50")}
              >
                <HeroThumb kind={o.value === "THEME" ? THEMES[theme].hero : o.value} theme={theme} headingFont={headingFont} design={design} brand={brand} />
                <span className="block font-medium">{o.label}</span>
              </button>
            ))}
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium">Shade over the banner picture</p>
            <p className="text-xs text-muted-foreground">Stronger keeps the heading readable over a busy photo.</p>
            <Segmented label="Shade over the banner picture" {...designField("hero_overlay")} options={HERO_OVERLAY_OPTIONS} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Section layouts</CardTitle>
          <CardDescription>How each list is laid out. &quot;Swipe row&quot; scrolls sideways and is easy to flick through on a phone.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5 sm:grid-cols-2">
          {(
            [
              ["Courses & batches", "course_layout", COURSE_LAYOUT_OPTIONS, "courses"],
              ["Notices", "notice_layout", NOTICE_LAYOUT_OPTIONS, "notices"],
              ["Gallery", "gallery_layout", GALLERY_LAYOUT_OPTIONS, "gallery"],
              ["Testimonials", "testimonial_layout", TESTIMONIAL_LAYOUT_OPTIONS, "testimonials"],
              ["Questions & answers", "faq_layout", FAQ_LAYOUT_OPTIONS, "faq"],
            ] as const
          ).map(([label, key, options, draw]) => (
            <div key={key} className="space-y-2">
              <p className="text-sm font-medium">{label}</p>
              <Segmented label={label} {...(designField(key) as { value: string; onChange: (v: string) => void })} options={options} render={(v) => DRAW[`${draw}:${v}`]} />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

export function ContentTab({ form, designField, brandPhone }: { form: Form; designField: DesignField; brandPhone: string | null }) {
  const errors = form.formState.errors;
  const language = designField("language");
  const announcementText = useWatch({ control: form.control, name: "announcement.text" });
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Website language</CardTitle>
          <CardDescription>The language of the menu, built-in headings, the enquiry form and the footer. What you write yourself is shown as you wrote it.</CardDescription>
        </CardHeader>
        <CardContent>
          <div role="radiogroup" aria-label="Website language" className="grid gap-3 sm:grid-cols-2">
            {LANGUAGE_OPTIONS.map((o) => (
              <button
                key={o.value}
                type="button"
                role="radio"
                aria-checked={language.value === o.value}
                onClick={() => language.onChange(o.value)}
                className={cn("surface-glass-item space-y-1 rounded-lg border p-3 text-left", language.value === o.value ? "border-primary ring-2 ring-primary/40" : "hover:bg-muted/50")}
              >
                <span className="block font-medium">{o.label}</span>
                <span lang={o.value === "BN" ? "bn" : "en"} className="block text-xs text-muted-foreground">
                  {o.sample}
                </span>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Welcome banner</CardTitle>
          <CardDescription>The top of the website, always shown first.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <FormField id="hero_heading" label="Heading" hint="Leave empty to show the institute's name." error={errors.hero_heading?.message} className="sm:col-span-2">
            <Input id="hero_heading" {...form.register("hero_heading")} />
          </FormField>
          <FormField id="hero_subheading" label="Line under the heading" hint="Optional, e.g. 'SSC and HSC coaching in Mirpur since 2010'." error={errors.hero_subheading?.message} className="sm:col-span-2">
            <Input id="hero_subheading" {...form.register("hero_subheading")} />
          </FormField>
          <FormField id="hero_image" label="Picture" hint="Optional. A wide photo works best.">
            <Controller control={form.control} name="hero_image_file_id" render={({ field }) => (
              <ImageField id="hero_image" category="WEBSITE_IMAGE" label="Welcome banner picture" value={field.value || null} onChange={(id) => field.onChange(id ?? "")} />
            )} />
          </FormField>
          <FormField id="hero_button" label="Button" hint={!brandPhone ? "Call needs a phone number in Institute Settings." : "Enquire shows once the enquiry form section is on."}>
            <Controller
              control={form.control}
              name="hero_button"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="hero_button" className="w-full sm:w-80">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {HERO_BUTTON_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </FormField>
        </CardContent>
      </Card>

      <SlidesCard form={form} />
      <TickerCard form={form} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">About</CardTitle>
          <CardDescription>A few lines about your institute. Hidden while it has no text or picture.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <FormField id="about_heading" label="Heading" hint="Leave empty for 'About' and your institute's name." error={errors.about_heading?.message} className="sm:col-span-2">
            <Input id="about_heading" {...form.register("about_heading")} />
          </FormField>
          <FormField id="about_text" label="Text" error={errors.about_text?.message} className="sm:col-span-2">
            <Textarea id="about_text" rows={6} {...form.register("about_text")} />
          </FormField>
          <FormField id="about_image" label="Picture" hint="Optional.">
            <Controller control={form.control} name="about_image_file_id" render={({ field }) => (
              <ImageField id="about_image" category="WEBSITE_IMAGE" label="About picture" value={field.value || null} onChange={(id) => field.onChange(id ?? "")} />
            )} />
          </FormField>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Announcement bar</CardTitle>
          <CardDescription>One line in a coloured strip at the very top, e.g. &quot;Admission open for HSC 2027&quot;. Visitors can close it. Leave the text empty for none.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <FormField id="announcement_text" label="Announcement" hint={`${announcementText.length} of ${ANNOUNCEMENT_MAX} characters.`} error={errors.announcement?.text?.message} className="sm:col-span-2">
            <Input id="announcement_text" maxLength={ANNOUNCEMENT_MAX} {...form.register("announcement.text")} />
          </FormField>
          <FormField id="announcement_link" label="Link" hint="Optional. A web address, or #enquiry to jump to your enquiry form." error={errors.announcement?.link_url?.message}>
            <Input id="announcement_link" placeholder="#enquiry" {...form.register("announcement.link_url")} />
          </FormField>
          <FormField id="announcement_link_label" label="Link words" hint="Optional, e.g. 'Enquire now'." error={errors.announcement?.link_label?.message}>
            <Input id="announcement_link_label" {...form.register("announcement.link_label")} />
          </FormField>
          <FormField id="announcement_until" label="Show until" hint="Optional. The bar disappears by itself after this day.">
            <Input id="announcement_until" type="date" className="w-full sm:w-48" {...form.register("announcement.show_until")} />
          </FormField>
        </CardContent>
      </Card>

      <StatsCard form={form} />
      <FeaturesCard form={form} />
      <FaqCard form={form} />
      <VideosCard form={form} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Social links</CardTitle>
          <CardDescription>Shown as icons in the header and footer. Paste the address of your page; leave empty to hide.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {SOCIAL_NETWORKS.map((n) => (
            <FormField key={n} id={`social_${n}`} label={<span className="inline-flex items-center gap-1.5"><SocialIcon network={n} />{SOCIAL_LABEL[n]}</span>} error={errors.social?.[n]?.message}>
              <Input id={`social_${n}`} inputMode="url" placeholder={n === "youtube" ? "youtube.com/@yourchannel" : `${n}.com/yourpage`} {...form.register(`social.${n}`)} />
            </FormField>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

export function SectionsTab({ form, language }: { form: Form; language: WebsiteDesignWire["language"] }) {
  const [renaming, setRenaming] = useState<string | null>(null);
  const t = SITE_LABELS[language];
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Sections</CardTitle>
        <CardDescription>
          Each section has its own page (shown under its name). Switch a section off to hide it everywhere; switch <strong>On Home</strong> to show it on the home page too. The order
          applies on Home and on every page. A section with nothing to show stays hidden, and so does a page with nothing on it.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Controller
          control={form.control}
          name="sections"
          render={({ field }) => {
            const move = (from: number, to: number) => {
              const next = [...field.value];
              [next[from], next[to]] = [next[to], next[from]];
              field.onChange(next);
            };
            return (
              <ol data-testid="website-sections" className="surface-glass-dense divide-y rounded-md border">
                {field.value.map((s, i) => {
                  const meta = SECTION_LABELS[s.key];
                  const open = renaming === s.key;
                  return (
                    <li key={s.key} className="px-3 py-2.5">
                      <div className="flex items-center gap-3">
                        <Switch
                          id={`section-${s.key}`}
                          checked={s.enabled}
                          aria-label={`Show ${meta.label}`}
                          onCheckedChange={(on) => field.onChange(field.value.map((x) => (x.key === s.key ? { ...x, enabled: on } : x)))}
                        />
                        <label htmlFor={`section-${s.key}`} className="min-w-0 flex-1">
                          <span className={cn("block text-sm font-medium", !s.enabled && "text-muted-foreground")}>{meta.label}</span>
                          <span className="block text-xs text-muted-foreground">
                            Page: {SITE_LABELS.EN.page[SECTION_PAGE[s.key]]} · {meta.source}
                          </span>
                        </label>
                        <label className={cn("flex shrink-0 items-center gap-2 text-xs", !s.enabled && "opacity-50")}>
                          <Switch
                            checked={s.on_home}
                            disabled={!s.enabled}
                            aria-label={`Show ${meta.label} on Home`}
                            onCheckedChange={(on) => field.onChange(field.value.map((x) => (x.key === s.key ? { ...x, on_home: on } : x)))}
                          />
                          <span className="hidden sm:inline">On Home</span>
                        </label>
                        {s.key !== "ABOUT" && (
                          <Button type="button" variant="ghost" size="icon" aria-label={`Rename ${meta.label}`} aria-expanded={open} onClick={() => setRenaming(open ? null : s.key)}>
                            <Pencil />
                          </Button>
                        )}
                        <Button type="button" variant="ghost" size="icon" disabled={i === 0} aria-label={`Move ${meta.label} up`} onClick={() => move(i, i - 1)}>
                          <ArrowUp />
                        </Button>
                        <Button type="button" variant="ghost" size="icon" disabled={i === field.value.length - 1} aria-label={`Move ${meta.label} down`} onClick={() => move(i, i + 1)}>
                          <ArrowDown />
                        </Button>
                      </div>
                      {open && (
                        <div className="mt-3 grid gap-3 pl-12 sm:grid-cols-2">
                          <FormField id={`title-${s.key}`} label="Heading" hint="Empty keeps the built-in heading." error={form.formState.errors.titles?.[s.key]?.title?.message}>
                            <Input id={`title-${s.key}`} placeholder={t.title[s.key]} {...form.register(`titles.${s.key}.title`)} />
                          </FormField>
                          <FormField id={`subtitle-${s.key}`} label="Line under the heading" hint="Optional." error={form.formState.errors.titles?.[s.key]?.subtitle?.message}>
                            <Input id={`subtitle-${s.key}`} placeholder={t.subtitle[s.key] ?? (s.key === "ENQUIRY" ? t.enquiryIntro : "")} {...form.register(`titles.${s.key}.subtitle`)} />
                          </FormField>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ol>
            );
          }}
        />
        <p className="mt-3 text-xs text-muted-foreground">The About heading is set with its text on the Content tab.</p>
      </CardContent>
    </Card>
  );
}
