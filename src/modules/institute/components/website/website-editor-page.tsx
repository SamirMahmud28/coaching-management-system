"use client";

import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, ExternalLink, Loader2 } from "lucide-react";
import Link from "next/link";
import { Controller, useForm, useWatch } from "react-hook-form";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { submitForm } from "@/lib/feedback";
import { cn } from "@/lib/utils";
import { HowThisWorks } from "@/modules/institute/help/how-this-works";
import {
  APPEARANCE_OPTIONS, BODY_FONT_OPTIONS, BUTTON_STYLE_OPTIONS, CARD_STYLE_OPTIONS, DENSITY_OPTIONS, FONT_OPTIONS, HERO_BUTTON_OPTIONS, RADIUS_OPTIONS,
  SECTION_LABELS, TEXT_SIZE_OPTIONS, THEME_OPTIONS,
} from "@/modules/website/options";
import { siteColours } from "@/modules/website/tokens";
import {
  APPEARANCES, BACKGROUNDS, BODY_FONTS, BUTTON_STYLES, CARD_STYLES, DENSITIES, GRADIENT_CHOICES, PALETTE_CHOICES, RADII, TEXT_SIZES, WEBSITE_FONTS, WEBSITE_THEMES,
} from "@/server/modules/website/design";
import { websiteApi, type WebsiteDesignWire, type WebsiteSettingsBody, type WebsiteSettingsRow } from "../../api";
import { instituteKeys } from "../../keys";
import { BackgroundPicker, FontSelect, fromWire, GradientPicker, PalettePicker, presetWire, Segmented, SiteScope, StyleSample, ThemePicker } from "./design-controls";
import { WebsiteTabs } from "./website-tabs";

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a colour like #1d4ed8.").nullable();
const schema = z
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
    }),
    sections: z.array(z.object({ key: z.enum(["ABOUT", "COURSES", "NOTICES", "GALLERY", "TESTIMONIALS", "ENQUIRY", "CONTACT"]), enabled: z.boolean() })),
    hero_heading: z.string().trim().max(120, "At most 120 characters."),
    hero_subheading: z.string().trim().max(250, "At most 250 characters."),
    hero_image_file_id: z.string(),
    hero_button: z.enum(["ENQUIRE", "CALL", "NONE"]),
    about_heading: z.string().trim().max(120, "At most 120 characters."),
    about_text: z.string().trim().max(3000, "At most 3000 characters."),
    about_image_file_id: z.string(),
  })
  .refine((v) => v.design.palette !== "CUSTOM" || !!v.design.custom_primary, { message: "Choose your main colour.", path: ["design", "custom_primary"] });
type Values = z.infer<typeof schema>;

const toValues = (s: WebsiteSettingsRow): Values => ({
  theme: s.theme, heading_font: s.heading_font, design: s.design, sections: s.sections, hero_heading: s.hero_heading ?? "", hero_subheading: s.hero_subheading ?? "",
  hero_image_file_id: s.hero_image_file_id ?? "", hero_button: s.hero_button, about_heading: s.about_heading ?? "", about_text: s.about_text ?? "",
  about_image_file_id: s.about_image_file_id ?? "",
});
const orNull = (v: string) => (v.trim() === "" ? null : v.trim());

/** The website's look, welcome banner, About text and sections (`website.manage`, D124–D141). Saves are public at once (D126). */
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
  const [undo, setUndo] = useState<{ theme: Values["theme"]; heading_font: Values["heading_font"]; design: WebsiteDesignWire } | null>(null);

  const theme = useWatch({ control: form.control, name: "theme" });
  const headingFont = useWatch({ control: form.control, name: "heading_font" });
  const design = useWatch({ control: form.control, name: "design" });
  const designValue = fromWire(design);
  const setDesign = (patch: Partial<WebsiteDesignWire>) => form.setValue("design", { ...form.getValues("design"), ...patch }, { shouldDirty: true });
  const designField = <K extends keyof WebsiteDesignWire>(key: K) => ({ value: design[key], onChange: (v: WebsiteDesignWire[K]) => setDesign({ [key]: v } as Partial<WebsiteDesignWire>) });

  /** Picking a theme also applies its fonts, shapes and background; the colours stay. One click undoes it. */
  function pickTheme(next: Values["theme"]) {
    if (next === theme) return;
    setUndo({ theme, heading_font: headingFont, design: form.getValues("design") });
    const preset = presetWire(next, form.getValues("design"));
    form.setValue("theme", next, { shouldDirty: true });
    form.setValue("heading_font", preset.heading_font, { shouldDirty: true });
    form.setValue("design", preset.design, { shouldDirty: true });
  }
  function undoTheme() {
    if (!undo) return;
    form.setValue("theme", undo.theme, { shouldDirty: true });
    form.setValue("heading_font", undo.heading_font, { shouldDirty: true });
    form.setValue("design", undo.design, { shouldDirty: true });
    setUndo(null);
  }

  async function save(v: Values) {
    const body: WebsiteSettingsBody = {
      theme: v.theme, heading_font: v.heading_font, design: v.design, sections: v.sections, hero_heading: orNull(v.hero_heading), hero_subheading: orNull(v.hero_subheading),
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
        fieldMap: {
          heroHeading: "hero_heading", heroSubheading: "hero_subheading", heroImageFileId: "hero_image_file_id", aboutHeading: "about_heading", aboutText: "about_text",
          aboutImageFileId: "about_image_file_id", headingFont: "heading_font", "design.customPrimary": "design.custom_primary", "design.customAccent": "design.custom_accent",
        },
      },
    );
  }

  const themeLabel = THEME_OPTIONS.find((o) => o.value === theme)?.label;
  const primary = siteColours(designValue, brand.primary_color).primary;

  return (
    <form onSubmit={form.handleSubmit(save)} className="space-y-6">
      <Tabs defaultValue="look">
        <TabsList>
          <TabsTrigger value="look">Look</TabsTrigger>
          <TabsTrigger value="content">Banner &amp; About</TabsTrigger>
          <TabsTrigger value="sections">Sections</TabsTrigger>
        </TabsList>

        <TabsContent value="look" className="mt-4">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
            <div className="min-w-0 space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Theme</CardTitle>
                  <CardDescription>The theme sets the layout and its own fonts, shapes and background. Your colours stay; change anything below afterwards.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <ThemePicker value={theme} onChange={pickTheme} design={designValue} brand={brand.primary_color} />
                  {undo && (
                    <p role="status" className="text-sm text-muted-foreground">
                      Fonts, shapes and background now follow {themeLabel}.{" "}
                      <button type="button" onClick={undoTheme} className="font-medium text-foreground underline">
                        Undo
                      </button>
                    </p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Colours</CardTitle>
                  <CardDescription>
                    A ready-made palette, your brand colour from{" "}
                    <Link href="/app/settings" className="underline">
                      Institute Settings
                    </Link>
                    , or your own two colours. Text is adjusted automatically so it always reads clearly, in light and dark.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <PalettePicker design={design} onChange={setDesign} brand={brand.primary_color} />
                  {(errors.design?.custom_primary || errors.design?.custom_accent) && (
                    <p className="text-sm text-destructive">{errors.design?.custom_primary?.message ?? errors.design?.custom_accent?.message}</p>
                  )}
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Gradient</p>
                    <p className="text-xs text-muted-foreground">Used by gradient buttons, the colour-glow background and the Vibrant, Glass and Aurora banners.</p>
                    <GradientPicker {...designField("gradient")} design={designValue} brand={brand.primary_color} />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Fonts</CardTitle>
                  <CardDescription>Every font also shows Bangla text correctly; the Bangla fonts are designed for it.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4 sm:grid-cols-2">
                  <FormField id="heading_font" label="Heading font">
                    <FontSelect id="heading_font" value={headingFont} onChange={(v) => form.setValue("heading_font", v, { shouldDirty: true })} options={FONT_OPTIONS} />
                  </FormField>
                  <FormField id="body_font" label="Text font">
                    <FontSelect id="body_font" {...designField("body_font")} options={BODY_FONT_OPTIONS} />
                  </FormField>
                  <div className="space-y-2 sm:col-span-2">
                    <p className="text-sm font-medium">Text size</p>
                    <Segmented label="Text size" {...designField("text_size")} options={TEXT_SIZE_OPTIONS} />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Shapes &amp; spacing</CardTitle>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Corners</p>
                    <Segmented
                      label="Corners"
                      {...designField("radius")}
                      options={RADIUS_OPTIONS}
                      render={(v) => <span aria-hidden className="block h-6 w-10 border-2 border-foreground/60" style={{ borderRadius: { NONE: 0, SMALL: 4, MEDIUM: 8, LARGE: 14, FULL: 999 }[v] }} />}
                    />
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Buttons</p>
                    <Segmented
                      label="Buttons"
                      {...designField("button_style")}
                      options={BUTTON_STYLE_OPTIONS}
                      render={(v) => (
                        <SiteScope design={designValue} brand={brand.primary_color} button={v}>
                          <span className="site-btn pointer-events-none px-2.5! py-1! text-[11px]!">Enquire</span>
                        </SiteScope>
                      )}
                    />
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Cards</p>
                    <Segmented
                      label="Cards"
                      {...designField("card_style")}
                      options={CARD_STYLE_OPTIONS}
                      render={(v) => (
                        <SiteScope design={designValue} brand={brand.primary_color} card={v}>
                          <span className="site-card block h-9 w-14 p-1.5">
                            <span className="block h-1.5 w-8 rounded bg-foreground/50" />
                          </span>
                        </SiteScope>
                      )}
                    />
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Spacing between sections</p>
                    <Segmented label="Spacing" {...designField("density")} options={DENSITY_OPTIONS} />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Background &amp; appearance</CardTitle>
                  <CardDescription>A faint pattern behind the whole site in your main colour. Nakshi Kantha and Alpana are inspired by Bengali folk art.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  <BackgroundPicker {...designField("background")} primary={primary} />
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Light or dark</p>
                    <div role="radiogroup" aria-label="Light or dark" className="grid gap-2 sm:grid-cols-3">
                      {APPEARANCE_OPTIONS.map((o) => (
                        <button
                          key={o.value}
                          type="button"
                          role="radio"
                          aria-checked={design.appearance === o.value}
                          onClick={() => setDesign({ appearance: o.value })}
                          className={cn("rounded-md border p-3 text-left", design.appearance === o.value ? "border-primary ring-1 ring-primary/40" : "hover:bg-muted/50")}
                        >
                          <span className="block text-sm font-medium">{o.label}</span>
                          <span className="block text-xs text-muted-foreground">{o.description}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <aside className="lg:sticky lg:top-4 lg:self-start">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Style sample</CardTitle>
                  <CardDescription>Your colours, fonts, buttons and cards. Save, then View website to see every section.</CardDescription>
                </CardHeader>
                <CardContent>
                  <StyleSample theme={theme} headingFont={headingFont} design={designValue} brand={brand.primary_color} size="large" />
                </CardContent>
              </Card>
            </aside>
          </div>
        </TabsContent>

        <TabsContent value="content" className="mt-4 space-y-6">
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
              <FormField id="hero_button" label="Button" hint={!brand.phone ? "Call needs a phone number in Institute Settings." : "Enquire shows once the enquiry form section is on."}>
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
        </TabsContent>

        <TabsContent value="sections" className="mt-4">
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
        </TabsContent>
      </Tabs>

      <div className="sticky bottom-0 z-10 -mx-1 flex items-center justify-end gap-3 border-t bg-background/95 px-1 py-3 backdrop-blur">
        {form.formState.isDirty && <span className="text-sm text-muted-foreground">Unsaved changes</span>}
        <Button type="submit" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting && <Loader2 className="animate-spin" />} Save website
        </Button>
      </div>
    </form>
  );
}
