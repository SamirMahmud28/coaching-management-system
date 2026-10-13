"use client";

import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Loader2 } from "lucide-react";
import Link from "next/link";
import { useForm, useWatch } from "react-hook-form";
import { FormField } from "@/components/shared/form-field";
import { PageHeader } from "@/components/shared/page-header";
import { ErrorState, LoadingState } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { submitForm } from "@/lib/feedback";
import { cn } from "@/lib/utils";
import { HowThisWorks } from "@/modules/institute/help/how-this-works";
import {
  APPEARANCE_OPTIONS, BODY_FONT_OPTIONS, BUTTON_STYLE_OPTIONS, CARD_STYLE_OPTIONS, DENSITY_OPTIONS, FONT_OPTIONS, RADIUS_OPTIONS, TEXT_SIZE_OPTIONS, THEME_OPTIONS,
} from "@/modules/website/options";
import { siteColours } from "@/modules/website/tokens";
import { websiteApi, type WebsiteDesignWire, type WebsiteSettingsRow } from "../../api";
import { instituteKeys } from "../../keys";
import { BackgroundPicker, FontSelect, fromWire, GradientPicker, PalettePicker, presetWire, Segmented, SiteScope, StyleSample, ThemePicker } from "./design-controls";
import { editorSchema, toBody, toEditorValues, type EditorValues } from "./editor-schema";
import { ContentTab, LayoutTab, SectionsTab } from "./editor-tabs";
import { WebsiteTabs } from "./website-tabs";

/** The website's look, layout, words and sections (`website.manage`, D124–D141). Saves are public at once (D126, D139). */
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
  const form = useForm<EditorValues>({ resolver: zodResolver(editorSchema), defaultValues: toEditorValues(settings) });
  const errors = form.formState.errors;
  const brand = settings.brand;
  const [undo, setUndo] = useState<{ theme: EditorValues["theme"]; heading_font: EditorValues["heading_font"]; design: WebsiteDesignWire } | null>(null);

  const theme = useWatch({ control: form.control, name: "theme" });
  const headingFont = useWatch({ control: form.control, name: "heading_font" });
  const design = useWatch({ control: form.control, name: "design" });
  const designValue = fromWire(design);
  const setDesign = (patch: Partial<WebsiteDesignWire>) => form.setValue("design", { ...form.getValues("design"), ...patch }, { shouldDirty: true });
  const designField = <K extends keyof WebsiteDesignWire>(key: K) => ({ value: design[key], onChange: (v: WebsiteDesignWire[K]) => setDesign({ [key]: v } as Partial<WebsiteDesignWire>) });

  /** Picking a theme also applies its fonts, shapes, background and layouts; the colours and language stay. One click undoes it. */
  function pickTheme(next: EditorValues["theme"]) {
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

  async function save(v: EditorValues) {
    await submitForm(
      form,
      async () => {
        const saved = await websiteApi.saveSettings(toBody(v));
        queryClient.setQueryData(instituteKeys.website("settings"), saved);
      },
      {
        success: "Website saved. It's public now.",
        fieldMap: { heroHeading: "hero_heading", heroSubheading: "hero_subheading", heroImageFileId: "hero_image_file_id", aboutHeading: "about_heading", aboutText: "about_text", aboutImageFileId: "about_image_file_id", headingFont: "heading_font" },
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
          <TabsTrigger value="layout">Layout</TabsTrigger>
          <TabsTrigger value="content">Content</TabsTrigger>
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

        <TabsContent value="layout" className="mt-4">
          <LayoutTab designField={designField} design={designValue} theme={theme} headingFont={headingFont} brand={brand.primary_color} />
        </TabsContent>

        <TabsContent value="content" className="mt-4">
          <ContentTab form={form} designField={designField} brandPhone={brand.phone} />
        </TabsContent>

        <TabsContent value="sections" className="mt-4">
          <SectionsTab form={form} language={design.language} />
        </TabsContent>
      </Tabs>

      <div className="sticky bottom-0 z-10 -mx-1 flex items-center justify-end gap-3 border-t bg-background/95 px-1 py-3 backdrop-blur">
        {Object.keys(errors).length > 0 && <span className="text-sm text-destructive">Check the highlighted fields.</span>}
        {form.formState.isDirty && <span className="text-sm text-muted-foreground">Unsaved changes</span>}
        <Button type="submit" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting && <Loader2 className="animate-spin" />} Save website
        </Button>
      </div>
    </form>
  );
}
