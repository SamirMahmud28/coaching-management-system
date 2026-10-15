"use client";

import { Children, useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

// The banner slider's moving part. The slides themselves are rendered on the server, so the first one shows
// at once and all of them are in the page; this only fades between them. It turns on its own every few seconds
// (faster at Lively motion), pauses while the pointer or keyboard focus is on it, and stays put at Off motion or for
// visitors who ask for less motion. Dots and arrows always work.

export function SlideRotator({
  children,
  motion,
  labels,
}: {
  children: ReactNode;
  motion: "OFF" | "SUBTLE" | "NORMAL" | "LIVELY";
  /** Plain strings, as they come from the server: one name per slide, then the arrows. */
  labels: { slides: string[]; previous: string; next: string };
}) {
  const slides = Children.toArray(children);
  const total = slides.length;
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const region = useRef<HTMLElement>(null);
  const go = (i: number) => setActive((i + total) % total);

  useEffect(() => {
    if (paused || motion === "OFF" || total < 2) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const timer = setInterval(() => setActive((a) => (a + 1) % total), motion === "LIVELY" ? 5000 : 6500);
    return () => clearInterval(timer);
  }, [paused, motion, total]);

  return (
    <section
      ref={region}
      aria-label="Welcome"
      aria-roledescription="carousel"
      data-testid="hero-slider"
      className="relative isolate overflow-hidden"
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={(e) => !region.current?.contains(e.relatedTarget as Node) && setPaused(false)}
    >
      <div className="grid">
        {slides.map((slide, i) => (
          <div
            key={i}
            role="group"
            aria-roledescription="slide"
            aria-label={labels.slides[i]}
            aria-hidden={i !== active}
            inert={i !== active}
            data-active={i === active}
            className={cn("col-start-1 row-start-1 transition-opacity duration-700", i === active ? "opacity-100" : "pointer-events-none opacity-0")}
          >
            {slide}
          </div>
        ))}
      </div>
      {total > 1 && (
        <div className="absolute inset-x-0 bottom-4 z-10 flex items-center justify-center gap-3">
          <button type="button" aria-label={labels.previous} onClick={() => go(active - 1)} className="flex size-9 items-center justify-center rounded-full bg-black/35 text-white backdrop-blur hover:bg-black/55">
            <ChevronLeft aria-hidden className="size-5" />
          </button>
          {slides.map((_, i) => (
            <button
              key={i}
              type="button"
              aria-label={labels.slides[i]}
              aria-current={i === active}
              onClick={() => go(i)}
              className={cn("h-2.5 rounded-full bg-white/60 transition-all hover:bg-white", i === active ? "w-7 bg-white" : "w-2.5")}
            />
          ))}
          <button type="button" aria-label={labels.next} onClick={() => go(active + 1)} className="flex size-9 items-center justify-center rounded-full bg-black/35 text-white backdrop-blur hover:bg-black/55">
            <ChevronRight aria-hidden className="size-5" />
          </button>
        </div>
      )}
    </section>
  );
}
