"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

// Arrows for a swipe row (D135): visitors with a mouse move it one screen at a time; touch screens simply swipe.

export function CarouselNav({ targetId, previous, next }: { targetId: string; previous: string; next: string }) {
  const scroll = (direction: 1 | -1) => {
    const list = document.getElementById(targetId);
    list?.scrollBy({ left: direction * list.clientWidth * 0.85, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  };
  const button =
    "flex size-10 items-center justify-center rounded-full border bg-background/90 shadow-sm backdrop-blur transition-colors hover:bg-[var(--site-primary)] hover:text-[var(--site-on-primary)]";
  return (
    <div className="hidden justify-end gap-2 pb-3 sm:flex">
      <button type="button" aria-label={previous} aria-controls={targetId} onClick={() => scroll(-1)} className={button}>
        <ChevronLeft aria-hidden className="size-5" />
      </button>
      <button type="button" aria-label={next} aria-controls={targetId} onClick={() => scroll(1)} className={button}>
        <ChevronRight aria-hidden className="size-5" />
      </button>
    </div>
  );
}
