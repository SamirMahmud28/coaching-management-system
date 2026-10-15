import { Trophy } from "lucide-react";
import type { SectionProps } from "./shared";

// The toppers ticker: a slowly moving strip of the achievers under the Home banner. The list is written twice
// so the strip loops without a gap; the copy is hidden from screen readers. It stands still (and scrolls by hand) at
// Off motion or for visitors who ask for less motion, and pauses under the pointer.

export function Ticker({ site, t }: SectionProps) {
  const items = site.achievers;
  const row = (copy: boolean) => (
    <ul aria-hidden={copy || undefined} className="flex shrink-0 items-center gap-10 pr-10">
      {items.map((a) => (
        <li key={a.id} className="flex items-center gap-2 whitespace-nowrap text-sm">
          <Trophy aria-hidden className="size-4 text-[var(--site-accent-ink)]" />
          <span className="font-semibold">{a.name}</span>
          <span className="text-[var(--site-primary-ink)]">{a.result}</span>
          {a.exam && <span className="text-muted-foreground">{a.exam}</span>}
        </li>
      ))}
    </ul>
  );
  return (
    <section aria-label={t.toppers} data-testid="toppers-ticker" className="site-ticker site-tint overflow-hidden border-y py-3">
      <div className="site-ticker-track flex w-max">
        {row(false)}
        {row(true)}
      </div>
    </section>
  );
}
