"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, ExternalLink, Loader2 } from "lucide-react";
import Link from "next/link";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { FormField } from "@/components/shared/form-field";
import { ImageField } from "@/components/shared/image-field";
import { PageHeader } from "@/components/shared/page-header";
import { ErrorState, LoadingState } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { submitForm } from "@/lib/feedback";
import { cn } from "@/lib/utils";
import { HowThisWorks } from "@/modules/institute/help/how-this-works";
import { FONT_OPTIONS, HERO_BUTTON_OPTIONS, SECTION_LABELS, THEME_OPTIONS } from "@/modules/website/options";
import { websiteApi, type WebsiteSettingsBody, type WebsiteSettingsRow } from "../../api";
import { instituteKeys } from "../../keys";
import { WebsiteTabs } from "./website-tabs";

const schema = z.object({
  theme: z.enum(["CLASSIC", "MODERN", "BOLD"]),
  heading_font: z.enum(["INTER", "POPPINS", "MERRIWEATHER", "PLAYFAIR", "HIND_SILIGURI"]),
  sections: z.array(z.object({ key: z.enum(["ABOUT", "COURSES", "NOTICES", "GALLERY", "TESTIMONIALS", "ENQUIRY", "CONTACT"]), enabled: z.boolean() })),
  hero_heading: z.string().trim().max(120, "At most 120 characters."),
  hero_subheading: z.string().trim().max(250, "At most 250 characters."),
  hero_image_file_id: z.string(),
  hero_button: z.enum(["ENQUIRE", "CALL", "NONE"]),
  about_heading: z.string().trim().max(120, "At most 120 characters."),
  about_text: z.string().trim().max(3000, "At most 3000 characters."),
  about_image_file_id: z.string(),
});
type Values = z.infer<typeof schema>;

const toValues = (s: WebsiteSettingsRow): Values => ({
  theme: s.theme, heading_font: s.heading_font, sections: s.sections, hero_heading: s.hero_heading ?? "", hero_subheading: s.hero_subheading ?? "",
  hero_image_file_id: s.hero_image_file_id ?? "", hero_button: s.hero_button, about_heading: s.about_heading ?? "", about_text: s.about_text ?? "",
  about_image_file_id: s.about_image_file_id ?? "",
});
const orNull = (v: string) => (v.trim() === "" ? null : v.trim());

/** The website's look, welcome banner, About text and sections (`website.manage`, D124–D131). Saves are public at once (D126). */
export function WebsiteEditorPage() {
  const settings = useQuery({ queryKey: instituteKeys.website("settings"), queryFn: websiteApi.settings });
  return (
    <>
      <PageHeader
        title="Website"
        description="Your institute's public website. Changes are public as soon as you save."
        actions={
          <Button asChild variant="outline">
            <a href="/" target="_blank" rel="noopener">
              View website <ExternalLink />
            </a>
          </Button>
        }
      />
      <WebsiteTabs />
      <HowThisWorks topic="website" />
      {settings.isPending ? <LoadingState /> : settings.error ? <ErrorState onRetry={() => settings.refetch()} /> : <Editor key={settings.data.updated_at ?? "new"} settings={settings.data} />}
    </>
  );
}

function Editor({ settings }: { settings: WebsiteSettingsRow }) {
  const queryClient = useQueryClient();
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: toValues(settings) });
  const errors = form.formState.errors;
  const brand = settings.brand;

  async function save(v: Values) {
    const body: WebsiteSettingsBody = {
      theme: v.theme, heading_font: v.heading_font, sections: v.sections, hero_heading: orNull(v.hero_heading), hero_subheading: orNull(v.hero_subheading),
      hero_image_file_id: v.hero_image_file_id || null, hero_button: v.hero_button, about_heading: orNull(v.about_heading), about_text: orNull(v.about_text),
      about_image_file_id: v.about_image_file_id || null,
    };
    await submitForm(
      form,
      async () => {
        const saved = await websiteApi.saveSettings(body);
        queryClient.setQueryData(instituteKeys.website("settings"), saved);
      },
      {
        success: "Website saved. It's public now.",
        fieldMap: { heroHeading: "hero_heading", heroSubheading: "hero_subheading", heroImageFileId: "hero_image_file_id", aboutHeading: "about_heading", aboutText: "about_text", aboutImageFileId: "about_image_file_id", headingFont: "heading_font" },
      },
    );
  }

  const choice = <K extends "heading_font" | "hero_button">(name: K, label: string, options: { value: Values[K]; label: string }[], hint?: string) => (
    <FormField id={name} label={label} hint={hint}>
      <Controller
        control={form.control}
        name={name}
        render={({ field }) => (
          <Select value={field.value} onValueChange={field.onChange}>
            <SelectTrigger id={name} className="w-full sm:w-80">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {options.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      />
    </FormField>
  );

  return (
    <form onSubmit={form.handleSubmit(save)} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Look</CardTitle>
          <CardDescription>
            The theme sets the layout. The brand colour, logo and contact details come from{" "}
            <Link href="/app/settings" className="underline">
              Institute Settings
            </Link>
            .
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <Controller
            control={form.control}
            name="theme"
            render={({ field }) => (
              <div role="radiogroup" aria-label="Theme" className="grid gap-3 sm:grid-cols-3">
                {THEME_OPTIONS.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    role="radio"
                    aria-checked={field.value === o.value}
                    onClick={() => field.onChange(o.value)}
                    className={cn("space-y-2 rounded-lg border p-3 text-left transition-colors", field.value === o.value ? "border-primary ring-2 ring-primary/40" : "hover:bg-muted/50")}
                  >
                    <ThemeSketch theme={o.value} brand={brand.primary_color} />
                    <span className="block font-medium">{o.label}</span>
                    <span className="block text-xs text-muted-foreground">{o.description}</span>
                  </button>
                ))}
              </div>
            )}
          />
          <div className="flex flex-wrap items-end gap-6">
            {choice("heading_font", "Heading font", FONT_OPTIONS, "Used for the website's headings; the body text stays easy to read.")}
            <div className="space-y-1.5 text-sm">
              <p className="font-medium">Brand colour</p>
              <div className="flex items-center gap-2">
                <span aria-hidden className="size-7 rounded-md border" style={{ background: brand.primary_color ?? "#2563eb" }} />
                <span className="text-muted-foreground">{brand.primary_color ? brand.primary_color : "Not set — blue is used"}</span>
              </div>
            </div>
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
          <FormField id="hero_image" label="Background picture" hint="Optional. A wide photo works best.">
            <Controller control={form.control} name="hero_image_file_id" render={({ field }) => (
              <ImageField id="hero_image" category="WEBSITE_IMAGE" label="Welcome banner picture" value={field.value || null} onChange={(id) => field.onChange(id ?? "")} />
            )} />
          </FormField>
          {choice(
            "hero_button",
            "Button",
            HERO_BUTTON_OPTIONS,
            !brand.phone ? "Call needs a phone number in Institute Settings." : "Enquire shows once the enquiry form section is on.",
          )}
        </CardContent>
      </Card>

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
          <CardTitle className="text-base">Sections</CardTitle>
          <CardDescription>Switch sections on or off and set their order. A section with nothing to show stays hidden.</CardDescription>
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
                <ol data-testid="website-sections" className="divide-y rounded-md border">
                  {field.value.map((s, i) => {
                    const meta = SECTION_LABELS[s.key];
                    return (
                      <li key={s.key} className="flex items-center gap-3 px-3 py-2.5">
                        <Switch
                          id={`section-${s.key}`}
                          checked={s.enabled}
                          aria-label={`Show ${meta.label}`}
                          onCheckedChange={(on) => field.onChange(field.value.map((x) => (x.key === s.key ? { ...x, enabled: on } : x)))}
                        />
                        <label htmlFor={`section-${s.key}`} className="min-w-0 flex-1">
                          <span className={cn("block text-sm font-medium", !s.enabled && "text-muted-foreground")}>{meta.label}</span>
                          <span className="block text-xs text-muted-foreground">{meta.source}</span>
                        </label>
                        <Button type="button" variant="ghost" size="icon" disabled={i === 0} aria-label={`Move ${meta.label} up`} onClick={() => move(i, i - 1)}>
                          <ArrowUp />
                        </Button>
                        <Button type="button" variant="ghost" size="icon" disabled={i === field.value.length - 1} aria-label={`Move ${meta.label} down`} onClick={() => move(i, i + 1)}>
                          <ArrowDown />
                        </Button>
                      </li>
                    );
                  })}
                </ol>
              );
            }}
          />
        </CardContent>
      </Card>

      <div className="sticky bottom-0 z-10 -mx-1 flex items-center justify-end gap-3 border-t bg-background/95 px-1 py-3 backdrop-blur">
        {form.formState.isDirty && <span className="text-sm text-muted-foreground">Unsaved changes</span>}
        <Button type="submit" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting && <Loader2 className="animate-spin" />} Save website
        </Button>
      </div>
    </form>
  );
}

/** A tiny drawing of each theme's banner and cards, in the brand colour. */
function ThemeSketch({ theme, brand }: { theme: "CLASSIC" | "MODERN" | "BOLD"; brand: string | null }) {
  const color = brand ?? "#2563eb";
  return (
    <span aria-hidden className="block overflow-hidden rounded-md border bg-background">
      {theme === "CLASSIC" && (
        <span className="flex h-12 flex-col items-center justify-center gap-1" style={{ background: `color-mix(in srgb, ${color} 12%, transparent)` }}>
          <span className="h-1.5 w-16 rounded bg-foreground/60" />
          <span className="h-1.5 w-8 rounded" style={{ background: color }} />
        </span>
      )}
      {theme === "MODERN" && (
        <span className="flex h-12 items-center gap-2 px-2" style={{ background: `color-mix(in srgb, ${color} 8%, transparent)` }}>
          <span className="flex flex-1 flex-col gap-1">
            <span className="h-1.5 w-14 rounded bg-foreground/60" />
            <span className="h-1.5 w-8 rounded-full" style={{ background: color }} />
          </span>
          <span className="h-8 w-12 rounded-lg bg-muted-foreground/30" />
        </span>
      )}
      {theme === "BOLD" && (
        <span className="flex h-12 flex-col justify-center gap-1 px-2" style={{ background: color }}>
          <span className="h-2 w-20 rounded bg-white/90" />
          <span className="h-1.5 w-8 rounded bg-white/60" />
        </span>
      )}
      <span className="flex gap-1.5 p-2">
        {[0, 1, 2].map((i) => (
          <span key={i} className={cn("h-5 flex-1 bg-muted", theme === "MODERN" ? "rounded-lg" : theme === "BOLD" ? "rounded-sm border-t-2" : "rounded border")} style={theme === "BOLD" ? { borderTopColor: color } : undefined} />
        ))}
      </span>
    </span>
  );
}
