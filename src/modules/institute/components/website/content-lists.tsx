"use client";

import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { Controller, useFieldArray, type UseFormReturn } from "react-hook-form";
import { FormField } from "@/components/shared/form-field";
import { ImageField } from "@/components/shared/image-field";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { FEATURE_ICON } from "@/modules/website/components/sections/showcase";
import { FEATURE_ICONS, MAX_EXTRA_SLIDES, MAX_FAQS, MAX_FEATURES, MAX_STATS, MAX_VIDEOS } from "@/server/modules/website/site-content";
import type { EditorValues } from "./editor-schema";

// The Content tab's lists (D138, D147): Stats, Why choose us, FAQ, videos, banner slides and the toppers ticker. Each list section stays hidden on the
// website while its list is empty.

type Form = UseFormReturn<EditorValues>;

const ICON_LABEL = (name: string) => name.replace(/([a-z])([A-Z])/g, "$1 $2");

function RowTools({ index, count, onMove, onRemove, what }: { index: number; count: number; onMove: (from: number, to: number) => void; onRemove: () => void; what: string }) {
  return (
    <div className="flex shrink-0 items-center">
      <Button type="button" variant="ghost" size="icon" disabled={index === 0} aria-label={`Move ${what} ${index + 1} up`} onClick={() => onMove(index, index - 1)}>
        <ArrowUp />
      </Button>
      <Button type="button" variant="ghost" size="icon" disabled={index === count - 1} aria-label={`Move ${what} ${index + 1} down`} onClick={() => onMove(index, index + 1)}>
        <ArrowDown />
      </Button>
      <Button type="button" variant="ghost" size="icon" aria-label={`Remove ${what} ${index + 1}`} onClick={onRemove}>
        <Trash2 />
      </Button>
    </div>
  );
}

export function StatsCard({ form }: { form: Form }) {
  const list = useFieldArray({ control: form.control, name: "stats" });
  const errors = form.formState.errors.stats;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Stats</CardTitle>
        <CardDescription>Big numbers that count up as visitors scroll to them, e.g. &quot;1200 + Students taught&quot; or &quot;98 % Pass rate&quot;. Up to {MAX_STATS}.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {list.fields.map((f, i) => (
          <div key={f.id} data-testid="stat-row" className="surface-glass-item flex flex-wrap items-start gap-3 rounded-md border p-3">
            <FormField id={`stat-${i}-value`} label="Number" error={errors?.[i]?.value?.message} className="w-28">
              <Input id={`stat-${i}-value`} inputMode="numeric" placeholder="1200" {...form.register(`stats.${i}.value`)} />
            </FormField>
            <FormField id={`stat-${i}-suffix`} label="Sign" hint="+ or %" error={errors?.[i]?.suffix?.message} className="w-20">
              <Input id={`stat-${i}-suffix`} maxLength={4} {...form.register(`stats.${i}.suffix`)} />
            </FormField>
            <FormField id={`stat-${i}-label`} label="What it counts" error={errors?.[i]?.label?.message} className="min-w-48 flex-1">
              <Input id={`stat-${i}-label`} maxLength={40} placeholder="Students taught" {...form.register(`stats.${i}.label`)} />
            </FormField>
            <div className="pt-6">
              <RowTools index={i} count={list.fields.length} onMove={list.move} onRemove={() => list.remove(i)} what="number" />
            </div>
          </div>
        ))}
        <Button type="button" variant="outline" disabled={list.fields.length >= MAX_STATS} onClick={() => list.append({ value: "", suffix: "+", label: "" })}>
          <Plus /> Add a number
        </Button>
      </CardContent>
    </Card>
  );
}

export function FeaturesCard({ form }: { form: Form }) {
  const list = useFieldArray({ control: form.control, name: "features" });
  const errors = form.formState.errors.features;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Why choose us</CardTitle>
        <CardDescription>Your reasons, each with an icon, a short title and a line, e.g. &quot;Small batches: at most 25 students, so every question gets answered.&quot; Up to {MAX_FEATURES}.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {list.fields.map((f, i) => (
          <div key={f.id} data-testid="feature-row" className="surface-glass-item grid gap-3 rounded-md border p-3 sm:grid-cols-[12rem_1fr_auto]">
            <FormField id={`feature-${i}-icon`} label="Icon">
              <Controller
                control={form.control}
                name={`features.${i}.icon`}
                render={({ field }) => {
                  const Current = FEATURE_ICON[field.value];
                  return (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id={`feature-${i}-icon`} className="w-full">
                        <span className="flex items-center gap-2">
                          <Current aria-hidden className="size-4" />
                          <SelectValue />
                        </span>
                      </SelectTrigger>
                      <SelectContent>
                        {FEATURE_ICONS.map((name) => {
                          const Icon = FEATURE_ICON[name];
                          return (
                            <SelectItem key={name} value={name}>
                              <Icon aria-hidden /> {ICON_LABEL(name)}
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  );
                }}
              />
            </FormField>
            <div className="space-y-3">
              <FormField id={`feature-${i}-title`} label="Title" error={errors?.[i]?.title?.message}>
                <Input id={`feature-${i}-title`} maxLength={60} placeholder="Small batches" {...form.register(`features.${i}.title`)} />
              </FormField>
              <FormField id={`feature-${i}-text`} label="Line" hint="Optional." error={errors?.[i]?.text?.message}>
                <Input id={`feature-${i}-text`} maxLength={200} {...form.register(`features.${i}.text`)} />
              </FormField>
            </div>
            <div className="sm:pt-6">
              <RowTools index={i} count={list.fields.length} onMove={list.move} onRemove={() => list.remove(i)} what="reason" />
            </div>
          </div>
        ))}
        <Button type="button" variant="outline" disabled={list.fields.length >= MAX_FEATURES} onClick={() => list.append({ icon: "Star", title: "", text: "" })}>
          <Plus /> Add a reason
        </Button>
      </CardContent>
    </Card>
  );
}

export function FaqCard({ form }: { form: Form }) {
  const list = useFieldArray({ control: form.control, name: "faqs" });
  const errors = form.formState.errors.faqs;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Questions &amp; answers</CardTitle>
        <CardDescription>What parents ask the front desk most, e.g. fees, batch times, admission documents. Visitors tap a question to see the answer. Up to {MAX_FAQS}.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {list.fields.map((f, i) => (
          <div key={f.id} data-testid="faq-row" className="surface-glass-item flex gap-3 rounded-md border p-3">
            <div className="min-w-0 flex-1 space-y-3">
              <FormField id={`faq-${i}-question`} label="Question" error={errors?.[i]?.question?.message}>
                <Input id={`faq-${i}-question`} maxLength={150} {...form.register(`faqs.${i}.question`)} />
              </FormField>
              <FormField id={`faq-${i}-answer`} label="Answer" error={errors?.[i]?.answer?.message}>
                <Textarea id={`faq-${i}-answer`} rows={3} maxLength={1000} {...form.register(`faqs.${i}.answer`)} />
              </FormField>
            </div>
            <div className="pt-6">
              <RowTools index={i} count={list.fields.length} onMove={list.move} onRemove={() => list.remove(i)} what="question" />
            </div>
          </div>
        ))}
        <Button type="button" variant="outline" disabled={list.fields.length >= MAX_FAQS} onClick={() => list.append({ question: "", answer: "" })}>
          <Plus /> Add a question
        </Button>
      </CardContent>
    </Card>
  );
}

export function VideosCard({ form }: { form: Form }) {
  const list = useFieldArray({ control: form.control, name: "videos" });
  const errors = form.formState.errors.videos;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Videos</CardTitle>
        <CardDescription>
          YouTube videos for the Gallery page, e.g. a classroom tour or a prize-giving. Each loads only when a visitor taps play, so the page stays fast. Up to {MAX_VIDEOS}.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {list.fields.map((f, i) => (
          <div key={f.id} data-testid="video-row" className="surface-glass-item flex flex-wrap items-start gap-3 rounded-md border p-3">
            <FormField id={`video-${i}-url`} label="YouTube address" hint="From YouTube's Share button." error={errors?.[i]?.url?.message} className="min-w-64 flex-1">
              <Input id={`video-${i}-url`} inputMode="url" placeholder="https://youtu.be/…" {...form.register(`videos.${i}.url`)} />
            </FormField>
            <FormField id={`video-${i}-title`} label="Title" hint="Optional." error={errors?.[i]?.title?.message} className="min-w-48 flex-1">
              <Input id={`video-${i}-title`} maxLength={100} {...form.register(`videos.${i}.title`)} />
            </FormField>
            <div className="pt-6">
              <RowTools index={i} count={list.fields.length} onMove={list.move} onRemove={() => list.remove(i)} what="video" />
            </div>
          </div>
        ))}
        <Button type="button" variant="outline" disabled={list.fields.length >= MAX_VIDEOS} onClick={() => list.append({ url: "", title: "" })}>
          <Plus /> Add a video
        </Button>
      </CardContent>
    </Card>
  );
}

/** Extra banner slides (D147): the main banner above is the first slide; with any extra, the banner becomes a slider. */
export function SlidesCard({ form }: { form: Form }) {
  const list = useFieldArray({ control: form.control, name: "hero_slides" });
  const errors = form.formState.errors.hero_slides;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Banner slides</CardTitle>
        <CardDescription>
          Add up to {MAX_EXTRA_SLIDES} more pictures, each with its own heading, and the welcome banner becomes a photo slider. The banner above is the first slide. The button stays the same on every slide.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {list.fields.map((f, i) => (
          <div key={f.id} data-testid="slide-row" className="surface-glass-item grid gap-3 rounded-md border p-3 sm:grid-cols-[10rem_1fr_auto]">
            <FormField id={`slide-${i}-image`} label={`Slide ${i + 2} picture`} error={errors?.[i]?.image_file_id?.message}>
              <Controller
                control={form.control}
                name={`hero_slides.${i}.image_file_id`}
                render={({ field }) => (
                  <ImageField id={`slide-${i}-image`} category="WEBSITE_IMAGE" label={`Slide ${i + 2} picture`} value={field.value || null} onChange={(id) => field.onChange(id ?? "")} />
                )}
              />
            </FormField>
            <div className="space-y-3">
              <FormField id={`slide-${i}-heading`} label="Heading" error={errors?.[i]?.heading?.message}>
                <Input id={`slide-${i}-heading`} maxLength={120} {...form.register(`hero_slides.${i}.heading`)} />
              </FormField>
              <FormField id={`slide-${i}-subheading`} label="Line under the heading" hint="Optional." error={errors?.[i]?.subheading?.message}>
                <Input id={`slide-${i}-subheading`} maxLength={250} {...form.register(`hero_slides.${i}.subheading`)} />
              </FormField>
            </div>
            <div className="sm:pt-6">
              <RowTools index={i} count={list.fields.length} onMove={list.move} onRemove={() => list.remove(i)} what="slide" />
            </div>
          </div>
        ))}
        <Button type="button" variant="outline" disabled={list.fields.length >= MAX_EXTRA_SLIDES} onClick={() => list.append({ image_file_id: "", heading: "", subheading: "" })}>
          <Plus /> Add a slide
        </Button>
      </CardContent>
    </Card>
  );
}

/** The toppers ticker (D147): a switch; its content comes from the Achievers tab. */
export function TickerCard({ form }: { form: Form }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Toppers ticker</CardTitle>
        <CardDescription>A slowly moving strip of your achievers (name, result, exam) right under the Home banner. Its names come from the Achievers tab.</CardDescription>
      </CardHeader>
      <CardContent>
        <Controller
          control={form.control}
          name="show_ticker"
          render={({ field }) => (
            <label className="flex items-center gap-3 text-sm">
              <Switch checked={field.value} onCheckedChange={field.onChange} aria-label="Show the toppers ticker" />
              Show the toppers ticker on Home
            </label>
          )}
        />
      </CardContent>
    </Card>
  );
}
