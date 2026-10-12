"use client";

import { ChevronDown, ChevronUp, Lightbulb } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { helpTopic, type HelpTopicKey } from "./content";

/**
 * The "How this works" panel at the top of a feature page (D96): what the feature is for, its steps and the rules the
 * system enforces, with a link to the full guide. Collapsed until clicked (D98).
 */
export function HowThisWorks({ topic }: { topic: HelpTopicKey }) {
  const t = helpTopic(topic);
  const [open, setOpen] = useState(false);

  return (
    <section aria-label={`How ${t.title.toLowerCase()} works`} className="rounded-lg border border-primary/25 bg-primary/5 text-sm" data-testid="how-this-works">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-center gap-2 px-4 py-2.5 text-left">
        <Lightbulb aria-hidden className="size-4 shrink-0 text-primary-strong" />
        <span className="flex-1 font-medium">How this works</span>
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
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="link" className="h-auto p-0" asChild>
              <Link href={`/app/help#${t.key}`}>Read the full guide{t.faqs.length ? " and common questions" : ""} →</Link>
            </Button>
            <Button variant="ghost" size="sm" className="ml-auto h-7" onClick={() => setOpen(false)}>
              Hide
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
