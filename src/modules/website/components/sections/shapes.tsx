import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

// Floating 3D shapes behind the welcome banner (D137): a spinning cube, a tilted ring, glossy orbs and a turning
// diamond, built with CSS 3D transforms (no WebGL, so they stay smooth on modest phones). They drift with the mouse
// pointer at different depths (`site-motion.tsx` sets --px/--py) and stand still for visitors who ask for less motion.
// `tone` picks the site's colours on a light banner, or the banner's text colour on a coloured one.

type Shape = { kind: "cube" | "ring" | "orb" | "diamond"; at: string; size: string; depth: number; delay?: string; wide?: boolean };

const SHAPES: Shape[] = [
  { kind: "cube", at: "top-[14%] right-[8%]", size: "clamp(3rem, 6vw, 5.5rem)", depth: 28, wide: true },
  { kind: "ring", at: "bottom-[12%] right-[22%]", size: "clamp(4rem, 9vw, 8rem)", depth: 16, wide: true },
  { kind: "orb", at: "top-[18%] left-[6%]", size: "clamp(2rem, 4vw, 3.5rem)", depth: 40 },
  { kind: "orb", at: "bottom-[18%] left-[38%]", size: "clamp(1.25rem, 2.4vw, 2rem)", depth: 55, delay: "-3s", wide: true },
  { kind: "diamond", at: "top-[56%] right-[4%]", size: "clamp(2rem, 4vw, 3.25rem)", depth: 34 },
];

export function FloatingShapes({ tone }: { tone: "brand" | "on-colour" }) {
  const colours = (
    tone === "brand"
      ? { "--shape-colour": "var(--site-primary)", "--shape-colour-2": "var(--site-accent)" }
      : { "--shape-colour": "var(--site-banner-ink, #ffffff)", "--shape-colour-2": "var(--site-banner-ink, #ffffff)" }
  ) as CSSProperties;
  return (
    <div aria-hidden data-testid="site-shapes" className="site-shapes" style={colours}>
      {SHAPES.map((s, i) => (
        <div key={i} className={cn("site-shape", s.at, s.wide && "hidden sm:block")} style={{ "--depth": s.depth, "--s": s.size, "--d": s.delay } as CSSProperties}>
          {s.kind === "cube" ? (
            <div className="site-cube">
              {Array.from({ length: 6 }, (_, f) => (
                <span key={f} />
              ))}
            </div>
          ) : (
            <div className={`site-${s.kind}`} />
          )}
        </div>
      ))}
    </div>
  );
}
