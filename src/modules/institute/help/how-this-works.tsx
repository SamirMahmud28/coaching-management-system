"use client";

import { ChevronDown, ChevronUp, Lightbulb } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { helpTopic, type HelpTopicKey } from "./content";

/**
 * The "How this works" panel at the top of a feature page (D96): what the feature is for, its steps and the rules the
 * system enforces, with a link to the full guide. Collapsed until clicked (D98). The portals have no Help centre, so
 * their pages pass `fullGuide={false}` and show the common questions in the panel instead.
 */
export function HowThisWorks({ topic, fullGuide = true }: { topic: HelpTopicKey; fullGuide?: boolean }) {
  const t = helpTopic(topic);
  const [open, setOpen] = useState(false);

  return (
    <section
      aria-label={`How ${t.title.toLowerCase()} works`}
      className={cn("text-sm transition-all", open ? "rounded-2xl border border-primary/25 bg-accent/40 shadow-xs" : "w-fit rounded-full border border-primary/25 bg-accent/50 hover:bg-accent")}
      data-testid="how-this-works"
    >
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className={cn("flex cursor-pointer items-center gap-2 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50", open ? "w-full rounded-t-2xl px-4 py-3" : "rounded-full py-1.5 pr-3 pl-3 pointer-coarse:py-2.5")}>
        <Lightbulb aria-hidden className="size-4 shrink-0 text-primary-strong" />
        <span className={cn("font-medium", open && "flex-1")}>How this works</span>
        {open ? <ChevronUp aria-hidden className="size-4" /> : <ChevronDown aria-hidden className="size-4" />}
      </button>
      {open && (
        <div className="space-y-3 px-4 pb-4">
          <p>{t.summary}</p>
          <div className="grid gap-4 lg:grid-cols-2">
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
          </div>
          {!fullGuide && t.faqs.length > 0 && (
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
          <div className="flex flex-wrap items-center gap-3">
            {fullGuide && (
              <Button variant="link" className="h-auto p-0" asChild>
                <Link href={`/app/help#${t.key}`}>Read the full guide{t.faqs.length ? " and common questions" : ""} →</Link>
              </Button>
            )}
            <Button variant="ghost" size="sm" className="ml-auto h-7" onClick={() => setOpen(false)}>
              Hide
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
