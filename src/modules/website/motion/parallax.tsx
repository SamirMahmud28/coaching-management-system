"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { m, useMotionValue, useMotionValueEvent, useScroll, useSpring } from "motion/react";

// Depth on scroll (D137): the wrapped picture drifts slower than the page, by up to `distance` pixels either way.
// The server can't know whether the visitor asked for less motion, so both renders start without any offset and only
// scrolling (in the browser, without "reduce motion") moves it: the markup always matches on hydration.

const reducedMotion = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export function Parallax({ children, className, distance = 60 }: { children: ReactNode; className?: string; distance?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const y = useMotionValue(0);
  const follow = (progress: number) => {
    if (!reducedMotion()) y.set((progress * 2 - 1) * distance);
  };
  useMotionValueEvent(scrollYProgress, "change", follow);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- place the picture once after loading; scrolling does the rest
  useEffect(() => follow(scrollYProgress.get()), []);
  return (
    <m.div ref={ref} className={className} style={{ y }}>
      {children}
    </m.div>
  );
}

/** A thin bar at the very top that fills as the visitor scrolls down the page. */
export function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 140, damping: 30, restDelta: 0.001 });
  return <m.div aria-hidden data-testid="scroll-progress" className="fixed inset-x-0 top-0 z-50 h-1 origin-left bg-[image:var(--site-gradient)]" style={{ scaleX }} />;
}
