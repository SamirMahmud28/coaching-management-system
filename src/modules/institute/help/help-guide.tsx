"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { useState, useSyncExternalStore } from "react";
import type { HelpTopic } from "./content";

const subscribeHash = (listener: () => void) => {
  window.addEventListener("hashchange", listener);
  return () => window.removeEventListener("hashchange", listener);
};

/**
 * One guide in the Help centre: the title and summary, expanding to the steps, rules and common questions when clicked
 *. A link straight to it (`/app/help#<key>`, e.g. from a page's panel) opens it.
 */
export function HelpGuide({ topic: t }: { topic: HelpTopic }) {
  const hash = useSyncExternalStore(subscribeHash, () => window.location.hash.slice(1), () => "");
  const [toggled, setToggled] = useState<boolean | null>(null);
  const open = toggled ?? hash === t.key;

  return (
    <article id={t.key} className="surface-glass-item scroll-mt-20 rounded-lg border text-sm" data-testid={`guide-${t.key}`}>
      <button type="button" onClick={() => setToggled(!open)} aria-expanded={open} className="flex w-full items-start gap-3 p-4 text-left">
        <span className="min-w-0 flex-1">
          <span className="block text-base font-semibold">{t.title}</span>
          <span className="mt-0.5 block text-muted-foreground">{t.summary}</span>
        </span>
        {open ? <ChevronUp aria-hidden className="mt-1 size-4 shrink-0" /> : <ChevronDown aria-hidden className="mt-1 size-4 shrink-0" />}
      </button>
      {open && (
        <div className="space-y-3 px-4 pb-4">
          <div>
            <p className="mb-1 font-medium">Steps</p>
            <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
              {t.steps.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
          </div>
          {t.rules.length > 0 && (
            <div>
              <p className="mb-1 font-medium">Good to know</p>
              <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                {t.rules.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </div>
          )}
          {t.faqs.length > 0 && (
            <div className="space-y-2">
              <p className="font-medium">Common questions</p>
              {t.faqs.map((f) => (
                <details key={f.q} className="surface-glass-item rounded-md border px-3 py-2">
                  <summary className="cursor-pointer font-medium">{f.q}</summary>
                  <p className="mt-1 text-muted-foreground">{f.a}</p>
                </details>
              ))}
            </div>
          )}
        </div>
      )}
    </article>
  );
}
