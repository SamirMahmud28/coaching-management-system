"use client";

import type { ReactNode } from "react";
import { Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { FONT_FAMILY } from "@/modules/website/fonts";
import { BACKGROUND_OPTIONS, PALETTE_FAMILY_LABELS, THEME_OPTIONS } from "@/modules/website/options";
import { backgroundLayer, backgroundSwatch } from "@/modules/website/patterns";
import { THEMES, type HeroKind } from "@/modules/website/themes";
import { contrast, siteColours, siteVariables } from "@/modules/website/tokens";
import "@/modules/website/website.css";
import { LOOKS, applyLook, type Look } from "@/modules/website/looks";
import {
  DEFAULT_DESIGN, GRADIENTS, PALETTE_FAMILIES, PALETTES, THEME_PRESETS, type Background, type WebsiteDesign, type WebsiteFont, type WebsiteTheme,
} from "@/server/modules/website/design";
import type { WebsiteDesignWire } from "../../api";

// Controls for the website's look (D135, D136). There is no live preview of the whole site (D139): instead every
// choice is shown as a swatch, a sample in its own font, or a small drawing in the institute's colours.

const toCamel = (k: string) => k.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
const toSnake = (k: string) => k.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

/** The design settings as the server and the public site name them. */
export const fromWire = (d: WebsiteDesignWire): WebsiteDesign => Object.fromEntries(Object.entries(d).map(([k, v]) => [toCamel(k), v])) as unknown as WebsiteDesign;

/** A ready-made look on the wire (D146): theme, palette, fonts and the rest, keeping the language. */
export function lookWire(look: Look, current: WebsiteDesignWire): { theme: WebsiteTheme; heading_font: WebsiteFont; design: WebsiteDesignWire } {
  const applied = applyLook(look, fromWire(current));
  return {
    theme: applied.theme,
    heading_font: applied.headingFont,
    design: Object.fromEntries(Object.entries(applied.design).map(([k, v]) => [toSnake(k), v])) as unknown as WebsiteDesignWire,
  };
}

/** The ready-made looks, each drawn as it will look in the institute's site. */
export function LookPicker({ onPick, brand }: { onPick: (look: Look) => void; brand: string | null }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
      {LOOKS.map((look) => {
        const applied = applyLook(look, DEFAULT_DESIGN);
        return (
          <button key={look.id} type="button" onClick={() => onPick(look)} aria-label={`Use the ${look.label} look`} className="space-y-1.5 rounded-lg border p-2 text-left transition-colors hover:bg-muted/50">
            <StyleSample theme={applied.theme} headingFont={applied.headingFont} design={applied.design} brand={brand} size="thumb" />
            <span className="block text-sm font-medium">{look.label}</span>
            <span className="line-clamp-2 block text-xs text-muted-foreground">{look.description}</span>
          </button>
        );
      })}
    </div>
  );
}

/** The theme's preset on the wire, keeping the colours (the institute's identity) and the language (its audience). */
export function presetWire(theme: WebsiteTheme, current: WebsiteDesignWire): { heading_font: WebsiteFont; design: WebsiteDesignWire } {
  const { headingFont, ...preset } = THEME_PRESETS[theme];
  const wire = Object.fromEntries(Object.entries(preset).map(([k, v]) => [toSnake(k), v])) as Partial<WebsiteDesignWire>;
  return { heading_font: headingFont, design: { ...current, ...wire } };
}

// --- the style sample -------------------------------------------------------------------------------------------

interface SampleProps {
  theme: WebsiteTheme;
  headingFont: WebsiteFont;
  design: WebsiteDesign;
  brand: string | null;
  /** A thumbnail for the theme picker, or the larger sample beside the controls. */
  size: "thumb" | "large";
}

/** The site's banner and two cards drawn with the real tokens and classes, so buttons and cards look as they will. */
export function StyleSample({ theme, headingFont, design, brand, size }: SampleProps) {
  const sig = THEMES[theme];
  const style = siteVariables(design, brand, FONT_FAMILY[headingFont], FONT_FAMILY[design.bodyFont]);
  const layer = backgroundLayer(design.background, siteColours(design, brand).primary);
  const thumb = size === "thumb";
  return (
    <div
      aria-hidden
      data-website=""
      data-site-button={design.buttonStyle}
      data-site-card={design.cardStyle}
      style={style}
      className={cn(
        "relative isolate overflow-hidden rounded-md border bg-background text-foreground",
        design.appearance === "DARK" && "dark",
        design.appearance === "LIGHT" && "theme-light",
      )}
    >
      {layer && <div className={cn("absolute inset-0 -z-10", layer.className)} style={layer.style} />}
      <MiniHero kind={design.heroLayout === "THEME" ? sig.hero : design.heroLayout} thumb={thumb} title={cn("site-heading leading-tight", sig.heroTitle.includes("uppercase") && "uppercase", sig.heroTitle.includes("font-black") || sig.heroTitle.includes("extrabold") ? "font-extrabold" : "font-bold")} />
      <div className={cn("grid grid-cols-2", thumb ? "gap-1.5 p-2" : "gap-3 p-4")}>
        {[0, 1].map((i) => (
          <div key={i} className={cn("site-card", thumb ? "space-y-1 p-1.5" : "space-y-1.5 p-3")}>
            <p className={cn("site-heading font-semibold", thumb ? "text-[8px]" : "text-sm")}>{i === 0 ? "SSC Science" : "HSC Batch"}</p>
            {!thumb && <p className="text-xs text-muted-foreground">Physics, Chemistry and Maths with weekly tests.</p>}
            <span className={cn("block rounded-full bg-[var(--site-primary)]", thumb ? "h-1 w-6" : "h-1.5 w-10")} />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Just the banner in one composition, for the banner layout picker. */
export function HeroThumb({ kind, theme, headingFont, design, brand }: { kind: HeroKind; theme: WebsiteTheme; headingFont: WebsiteFont; design: WebsiteDesign; brand: string | null }) {
  const style = siteVariables(design, brand, FONT_FAMILY[headingFont], FONT_FAMILY[design.bodyFont]);
  return (
    <div aria-hidden data-website="" data-site-button={design.buttonStyle} data-site-card={design.cardStyle} style={style} className={cn("overflow-hidden rounded-md border bg-background text-foreground", design.appearance === "DARK" && "dark")}>
      <MiniHero kind={kind} thumb title={cn("site-heading font-bold leading-tight", THEMES[theme].heroTitle.includes("uppercase") && "uppercase")} />
    </div>
  );
}

function MiniHero({ kind, thumb, title }: { kind: HeroKind; thumb: boolean; title: string }) {
  const t = thumb ? "text-[10px]" : "text-xl";
  const sub = thumb ? "h-1 w-10" : "h-2 w-32";
  const pad = thumb ? "p-2 gap-1" : "p-5 gap-2.5";
  const btn = <span className={cn("site-btn pointer-events-none", thumb ? "px-1.5! py-0.5! text-[7px]!" : "px-3! py-1.5! text-xs!")}>Enquire</span>;
  const pic = <span className={cn("site-media block bg-[color-mix(in_srgb,var(--site-primary)_25%,var(--muted))]", thumb ? "h-8 w-10" : "h-20 w-28")} />;
  const words = <p className={cn(title, t)}>Your institute</p>;
  const line = <span className={cn("block rounded bg-current opacity-30", sub)} />;
  switch (kind) {
    case "SPLIT":
      return <div className={cn("site-tint flex items-center justify-between", pad)}><div className="flex flex-col gap-1.5">{words}{line}{btn}</div>{pic}</div>;
    case "BANNER":
      return <div className={cn("site-on-colour flex flex-col bg-[var(--site-primary)] text-[var(--site-on-primary)]", pad)}>{words}{line}<div>{btn}</div></div>;
    case "GRADIENT":
      return <div className={cn("site-gradient site-on-colour flex items-center justify-between", pad)}><div className="flex flex-col gap-1.5">{words}{line}<div>{btn}</div></div>{pic}</div>;
    case "MINIMAL":
      return <div className={cn("flex flex-col", pad)}><p className={cn(title, thumb ? "text-sm" : "text-3xl")}>Your institute</p>{line}<span className={cn("site-media block bg-muted", thumb ? "h-4" : "h-12")} /></div>;
    case "AURORA":
      return (
        <div className={cn("relative isolate flex flex-col items-center text-center", pad)}>
          <span className="absolute -top-4 left-2 -z-10 size-16 rounded-full bg-[var(--site-gradient-a)] opacity-40 blur-xl" />
          <span className="absolute top-0 right-2 -z-10 size-14 rounded-full bg-[var(--site-gradient-b)] opacity-40 blur-xl" />
          <p className={cn(title, t, "site-gradient-text")}>Your institute</p>{line}{btn}
        </div>
      );
    case "GLASS":
      return (
        <div className={cn("site-gradient flex justify-center", thumb ? "p-2" : "p-5")}>
          <div className={cn("site-on-colour flex flex-col items-center rounded-[var(--site-radius)] border border-white/30 bg-white/15 text-center backdrop-blur", pad)}>{words}{line}{btn}</div>
        </div>
      );
    case "BENTO":
      return (
        <div className={cn("grid grid-cols-3", thumb ? "gap-1 p-1.5" : "gap-2 p-3")}>
          <div className={cn("site-card col-span-2 flex flex-col", pad)}>{words}{line}<div>{btn}</div></div>
          <div className="site-gradient rounded-[var(--site-radius)]" />
        </div>
      );
    case "BRUTAL":
      return <div className={cn("site-on-colour flex flex-col border-b-2 border-foreground bg-[var(--site-accent)] text-[var(--site-on-accent)]", pad)}>{words}{line}<div>{btn}</div></div>;
    case "CENTRED":
      return <div className={cn("site-tint flex flex-col items-center text-center", pad)}>{words}{line}{btn}</div>;
  }
}

// --- pickers -----------------------------------------------------------------------------------------------------

/** The twelve themes, each drawn with its own preset in the institute's current colours. */
export function ThemePicker({ value, onChange, design, brand }: { value: WebsiteTheme; onChange: (t: WebsiteTheme) => void; design: WebsiteDesign; brand: string | null }) {
  return (
    <div role="radiogroup" aria-label="Theme" className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
      {THEME_OPTIONS.map((o) => {
        const p = THEME_PRESETS[o.value];
        const selected = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(o.value)}
            className={cn("relative space-y-2 rounded-lg border p-2.5 text-left transition-colors", selected ? "border-primary ring-2 ring-primary/40" : "hover:bg-muted/50")}
          >
            <StyleSample theme={o.value} headingFont={p.headingFont} design={{ ...design, ...p }} brand={brand} size="thumb" />
            <span className="block text-sm font-medium">{o.label}</span>
            <span className="block text-xs text-muted-foreground">{o.description}</span>
            {selected && <Check aria-hidden className="absolute top-1.5 right-1.5 size-4 rounded-full bg-primary p-0.5 text-primary-foreground" />}
          </button>
        );
      })}
    </div>
  );
}

function Swatch({ colours, label, selected, onClick, wide }: { colours: string[] | string; label: string; selected: boolean; onClick: () => void; wide?: boolean }) {
  const background = typeof colours === "string" ? colours : colours.length === 1 ? colours[0] : `linear-gradient(135deg, ${colours[0]} 50%, ${colours[1]} 50%)`;
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn("relative shrink-0 border-2 transition-transform hover:scale-110", wide ? "h-8 w-14 rounded-md" : "size-9 rounded-full", selected ? "border-foreground" : "border-transparent")}
      style={{ background }}
    >
      {selected && <Check aria-hidden className="absolute inset-0 m-auto size-4 rounded-full bg-background/80 p-0.5 text-foreground" />}
    </button>
  );
}

/** Palettes by family, the Settings brand colour, or two custom colours (D136). */
export function PalettePicker({ design, onChange, brand }: { design: WebsiteDesignWire; onChange: (d: Partial<WebsiteDesignWire>) => void; brand: string | null }) {
  const brandColour = brand ?? "#2563eb";
  const custom = design.palette === "CUSTOM";
  const primary = design.custom_primary ?? brandColour;
  const light = custom && contrast(primary, "#ffffff") < 3;
  return (
    <div className="space-y-4">
      <div role="radiogroup" aria-label="Colours" className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            <Swatch colours={[brandColour]} label="Brand colour from Institute Settings" selected={design.palette === "BRAND"} onClick={() => onChange({ palette: "BRAND" })} />
            Brand colour
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Swatch colours="conic-gradient(#ef4444, #f59e0b, #22c55e, #0ea5e9, #8b5cf6, #ef4444)" label="Custom colours" selected={custom} onClick={() => onChange({ palette: "CUSTOM", custom_primary: design.custom_primary ?? brandColour })} />
            Custom
          </label>
        </div>
        {PALETTE_FAMILIES.map((family) => (
          <div key={family} className="flex flex-wrap items-center gap-2">
            <span className="w-28 shrink-0 text-xs text-muted-foreground">{PALETTE_FAMILY_LABELS[family]}</span>
            {PALETTES.filter((p) => p.family === family).map((p) => (
              <Swatch key={p.id} colours={[p.primary, p.accent]} label={p.label} selected={design.palette === p.id} onClick={() => onChange({ palette: p.id })} />
            ))}
          </div>
        ))}
      </div>
      {custom && (
        <div className="flex flex-wrap gap-6 rounded-md border p-3">
          <ColourInput id="custom_primary" label="Main colour" value={design.custom_primary} onChange={(v) => onChange({ custom_primary: v })} />
          <ColourInput id="custom_accent" label="Second colour" value={design.custom_accent} onChange={(v) => onChange({ custom_accent: v })} optional />
          {light && <p className="basis-full text-xs text-muted-foreground">A light main colour: text in it is darkened automatically so it stays readable, and buttons get dark text.</p>}
        </div>
      )}
    </div>
  );
}

function ColourInput({ id, label, value, onChange, optional }: { id: string; label: string; value: string | null; onChange: (v: string | null) => void; optional?: boolean }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label} {optional && <span className="font-normal text-muted-foreground">(optional)</span>}
      </label>
      <div className="flex items-center gap-2">
        <input type="color" aria-label={`${label} picker`} value={value ?? "#2563eb"} onChange={(e) => onChange(e.target.value)} className="h-9 w-12 cursor-pointer rounded border bg-background" />
        <Input id={id} className="w-28 font-mono" placeholder="#1d4ed8" maxLength={7} value={value ?? ""} onChange={(e) => onChange(e.target.value.trim() === "" ? null : e.target.value.trim())} />
      </div>
    </div>
  );
}

export function GradientPicker({ value, onChange, design, brand }: { value: string; onChange: (v: WebsiteDesignWire["gradient"]) => void; design: WebsiteDesign; brand: string | null }) {
  const auto = siteColours({ ...design, gradient: "AUTO" }, brand);
  return (
    <div role="radiogroup" aria-label="Gradient" className="flex flex-wrap items-center gap-2">
      <Swatch wide colours={`linear-gradient(135deg, ${auto.primary}, ${auto.accent})`} label="Auto: from your colours" selected={value === "AUTO"} onClick={() => onChange("AUTO")} />
      {GRADIENTS.map((g) => (
        <Swatch key={g.id} wide colours={`linear-gradient(135deg, ${g.stops.join(", ")})`} label={g.label} selected={value === g.id} onClick={() => onChange(g.id)} />
      ))}
    </div>
  );
}

/** A font choice whose options are written in their own typeface. */
export function FontSelect<T extends WebsiteFont>({ id, value, onChange, options }: { id: string; value: T; onChange: (v: T) => void; options: { value: T; label: string; note: string }[] }) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as T)}>
      <SelectTrigger id={id} className="w-full" style={{ fontFamily: FONT_FAMILY[value] }}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            <span style={{ fontFamily: FONT_FAMILY[o.value] }}>{o.label}</span>
            <span className="text-xs text-muted-foreground">{o.note}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** A small set of choices as buttons; `render` can draw each one. */
export function Segmented<T extends string>({ label, value, onChange, options, render }: { label: string; value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; render?: (v: T) => ReactNode }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn("flex min-w-20 flex-col items-center gap-1.5 rounded-md border px-3 py-2 text-xs transition-colors", value === o.value ? "border-primary bg-primary/5 font-medium ring-1 ring-primary/40" : "hover:bg-muted/50")}
        >
          {render?.(o.value)}
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function BackgroundPicker({ value, onChange, primary }: { value: Background; onChange: (v: Background) => void; primary: string }) {
  return (
    <Segmented
      label="Background"
      value={value}
      onChange={onChange}
      options={BACKGROUND_OPTIONS}
      render={(v) => (
        <span aria-hidden className="relative block h-10 w-16 overflow-hidden rounded border bg-background">
          <span className="absolute inset-0 opacity-40" style={backgroundSwatch(v, primary)} />
        </span>
      )}
    />
  );
}

/** Renders `children` (site buttons or cards) inside the site's tokens, so each option shows its real look. */
export function SiteScope({ design, brand, children, card, button }: { design: WebsiteDesign; brand: string | null; children: ReactNode; card?: WebsiteDesign["cardStyle"]; button?: WebsiteDesign["buttonStyle"] }) {
  const style = siteVariables(design, brand, FONT_FAMILY.INTER, FONT_FAMILY[design.bodyFont]);
  return (
    <span data-website="" data-site-card={card ?? design.cardStyle} data-site-button={button ?? design.buttonStyle} style={style} className="block">
      {children}
    </span>
  );
}
