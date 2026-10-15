"use client";

import { Check } from "lucide-react";
import { useEffect, useState } from "react";
import { useAppThemeControl } from "@/components/shell/app-theme-context";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { APP_THEMES, resolvePaper, type AppTheme } from "@/lib/app-themes";
import { notifyError, notifySuccess } from "@/lib/feedback";
import { cn } from "@/lib/utils";

/**
 * Picks an app theme and whether the paper background shows. Each card is a small drawing of the
 * app in that theme, made from the theme's real tokens. With `livePreview`, choices show across the whole app until
 * they are saved or cancelled (for the user's own app); without it, only the cards show them (the Super Admin choosing
 * for an institute). The paper switch follows the automatic rule (on with Classic Amber) until it is touched.
 */
export function ThemePicker({
  value,
  paper = null,
  onSave,
  livePreview = false,
  disabled = false,
  savedMessage = "Theme saved.",
}: {
  value: AppTheme;
  /** The saved paper setting: null = automatic. */
  paper?: boolean | null;
  onSave: (theme: AppTheme, paper: boolean | null) => Promise<unknown>;
  livePreview?: boolean;
  disabled?: boolean;
  savedMessage?: string;
}) {
  const control = useAppThemeControl();
  const [selected, setSelected] = useState<AppTheme>(value);
  const [paperChoice, setPaperChoice] = useState<boolean | null>(paper);
  const [saving, setSaving] = useState(false);
  const changed = selected !== value || paperChoice !== paper;
  const paperOn = resolvePaper(selected, paperChoice);

  // Leaving the page drops an unsaved preview.
  useEffect(() => {
    if (!livePreview || !control) return;
    return () => {
      control.preview(null);
      control.previewPaper(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on unmount
  }, []);

  function show(theme: AppTheme, paperValue: boolean | null) {
    setSelected(theme);
    setPaperChoice(paperValue);
    if (!livePreview || !control) return;
    const unchanged = theme === value && paperValue === paper;
    control.preview(unchanged ? null : theme);
    control.previewPaper(unchanged ? null : resolvePaper(theme, paperValue));
  }

  async function save() {
    setSaving(true);
    try {
      await onSave(selected, paperChoice);
      if (livePreview) control?.commit(selected, paperOn);
      notifySuccess(savedMessage);
    } catch (err) {
      notifyError(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div role="radiogroup" aria-label="App theme" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {APP_THEMES.map((t) => {
          const on = selected === t.key;
          return (
            <button
              key={t.key}
              type="button"
              role="radio"
              aria-checked={on}
              disabled={disabled}
              onClick={() => show(t.key, paperChoice)}
              className={cn(
                "group relative cursor-pointer rounded-2xl border bg-card p-2 text-left transition-all outline-none hover:shadow-md focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-60",
                on ? "border-primary-strong shadow-md ring-2 ring-primary/40" : "border-border",
              )}
            >
              <ThemeSample theme={t.key} paper={resolvePaper(t.key, paperChoice)} />
              <div className="flex items-start gap-2 px-1.5 pt-2.5 pb-1">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">
                    {t.name}
                    {t.key === value && <span className="ml-2 text-xs font-normal text-muted-foreground">(current)</span>}
                  </p>
                  <p className="text-xs text-muted-foreground">{t.description}</p>
                </div>
                {on && (
                  <span className="grid size-5 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground" aria-hidden="true">
                    <Check className="size-3.5" />
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      <div className="flex items-start gap-3 rounded-xl border bg-card p-3">
        <Switch id="paper-background" checked={paperOn} disabled={disabled} onCheckedChange={(v) => show(selected, v)} className="mt-0.5" />
        <div className="min-w-0 flex-1">
          <label htmlFor="paper-background" className="cursor-pointer text-sm font-medium">
            Paper background
          </label>
          <p className="text-xs text-muted-foreground">
            A subtle paper texture behind your pages; cards and tables stay plain and easy to read.
            {paperChoice === null && " Automatic: on with Classic Amber."}
          </p>
        </div>
        {paperChoice !== null && (
          <Button variant="ghost" size="sm" onClick={() => show(selected, null)} disabled={disabled}>
            Automatic
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={save} disabled={!changed || saving || disabled}>
          {saving ? "Saving…" : "Save theme"}
        </Button>
        {changed && (
          <Button variant="ghost" onClick={() => show(value, paper)} disabled={saving}>
            Cancel
          </Button>
        )}
        {changed && livePreview && <span className="text-sm text-muted-foreground">You are previewing this look. Save to keep it.</span>}
      </div>
    </div>
  );
}

/** A miniature of the app drawn with the theme's own tokens: a sidebar, a page with KPI cards, a button and a chart. */
export function ThemeSample({ theme, paper = false, className }: { theme: AppTheme; paper?: boolean; className?: string }) {
  return (
    <div
      data-app-theme={theme.toLowerCase()}
      data-paper={paper ? "on" : undefined}
      aria-hidden="true"
      className={cn("flex h-28 overflow-hidden rounded-xl border bg-background", className)}
    >
      <div className="glass-sidebar flex w-1/4 flex-col gap-1.5 p-2">
        <div className="mb-1 size-3.5 rounded-md bg-sidebar-primary" />
        <div className="h-1.5 w-4/5 rounded-full bg-sidebar-muted-foreground/50" />
        <div className="flex h-3 items-center rounded bg-sidebar-accent px-1">
          <div className="h-1.5 w-3/5 rounded-full bg-sidebar-accent-foreground" />
        </div>
        <div className="h-1.5 w-3/5 rounded-full bg-sidebar-muted-foreground/50" />
        <div className="h-1.5 w-4/6 rounded-full bg-sidebar-muted-foreground/50" />
      </div>
      <div className="flex flex-1 flex-col gap-2 p-2.5">
        <div className="flex items-center justify-between">
          <div className="h-2 w-1/3 rounded-full bg-foreground/80" />
          <div className="h-3.5 w-10 rounded-md bg-primary" />
        </div>
        <div className="grid flex-1 grid-cols-2 gap-1.5">
          <div className="surface-glass rounded-lg border p-1.5">
            <div className="h-1.5 w-1/2 rounded-full bg-muted-foreground/40" />
            <div className="mt-1.5 h-2.5 w-2/3 rounded-full bg-foreground/80" />
          </div>
          <div className="surface-glass flex items-end gap-1 rounded-lg border p-1.5">
            <div className="h-2/5 flex-1 rounded-sm bg-chart-1" />
            <div className="h-4/5 flex-1 rounded-sm bg-chart-2" />
            <div className="h-3/5 flex-1 rounded-sm bg-chart-3" />
            <div className="h-full flex-1 rounded-sm bg-chart-1" />
          </div>
        </div>
      </div>
    </div>
  );
}
