"use client";

import type { ReactNode } from "react";
import { LazyMotion, MotionConfig, domAnimation } from "motion/react";

// Motion for the public website: only the small `domAnimation` feature set is loaded, and every Motion
// animation follows the visitor's "reduce motion" setting.

export function MotionRoot({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  );
}
