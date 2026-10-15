/**
 * The dashboard's colour bands: ≥90% Excellent, 80–90% Good, <80% Needs attention. Colour is never the only cue:
 * every band is shown with its percentage and its name (legend).
 */
export type Band = "excellent" | "good" | "attention" | "none";

export function bandOf(percentage: number | null): Band {
  if (percentage === null) return "none";
  if (percentage >= 90) return "excellent";
  if (percentage >= 80) return "good";
  return "attention";
}

export const BAND_LABEL: Record<Band, string> = { excellent: "Excellent", good: "Good", attention: "Needs attention", none: "No data yet" };

/** Tile surfaces and text per band, from the status tokens (with dark-mode text). */
export const BAND_TILE: Record<Band, string> = {
  excellent: "border-success/35 bg-success/10",
  good: "border-warning/40 bg-warning/10",
  attention: "border-destructive/35 bg-destructive/10",
  none: "border-border bg-muted/40",
};

export const BAND_TEXT: Record<Band, string> = {
  excellent: "text-emerald-700 dark:text-emerald-300",
  good: "text-amber-700 dark:text-amber-300",
  attention: "text-red-700 dark:text-red-300",
  none: "text-muted-foreground",
};

export const BAND_BAR: Record<Band, string> = { excellent: "bg-success", good: "bg-warning", attention: "bg-destructive", none: "bg-muted-foreground/30" };

/** Chart fill per band (CSS colour from the theme tokens). */
export const BAND_FILL: Record<Band, string> = { excellent: "var(--success)", good: "var(--warning)", attention: "var(--destructive)", none: "var(--muted-foreground)" };

export function BandLegend({ className }: { className?: string }) {
  return (
    <ul className={["flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground", className].filter(Boolean).join(" ")}>
      {(
        [
          ["excellent", "≥90% Excellent"],
          ["good", "80–90% Good"],
          ["attention", "<80% Needs attention"],
        ] as const
      ).map(([band, label]) => (
        <li key={band} className="flex items-center gap-1.5">
          <span className={`size-2.5 rounded-sm ${BAND_BAR[band]}`} aria-hidden="true" />
          {label}
        </li>
      ))}
    </ul>
  );
}
