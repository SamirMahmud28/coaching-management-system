import type { CSSProperties } from "react";
import type { Background } from "@/server/modules/website/design";

// Page backgrounds behind the website's sections (D135, D136). Drawn in the site's main colour at low strength, as a
// fixed layer that never catches clicks. Nakshi Kantha (running-stitch flowers) and Alpana (lotus rosette) are our own
// simple SVG tiles inspired by the Bengali folk patterns.

const svg = (body: string, size: number) =>
  `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}' viewBox='0 0 ${size} ${size}'>${body}</svg>`)}")`;

function waves(c: string) {
  return svg(`<path d='M0 30 Q 15 18 30 30 T 60 30' fill='none' stroke='${c}' stroke-width='1.5'/><path d='M0 50 Q 15 38 30 50 T 60 50' fill='none' stroke='${c}' stroke-width='1' opacity='.6'/>`, 60);
}

/** Kantha: a running-stitch diamond with a four-petal flower at its heart. */
function nakshi(c: string) {
  const stitch = `fill='none' stroke='${c}' stroke-width='1.6' stroke-dasharray='3 3' stroke-linecap='round'`;
  return svg(
    `<path d='M32 6 L58 32 L32 58 L6 32 Z' ${stitch}/>` +
      `<path d='M32 18 L46 32 L32 46 L18 32 Z' ${stitch}/>` +
      `<g fill='${c}'><ellipse cx='32' cy='27' rx='2.6' ry='4.5'/><ellipse cx='32' cy='37' rx='2.6' ry='4.5'/><ellipse cx='27' cy='32' rx='4.5' ry='2.6'/><ellipse cx='37' cy='32' rx='4.5' ry='2.6'/></g>` +
      `<circle cx='0' cy='0' r='2' fill='${c}'/><circle cx='64' cy='0' r='2' fill='${c}'/><circle cx='0' cy='64' r='2' fill='${c}'/><circle cx='64' cy='64' r='2' fill='${c}'/>`,
    64,
  );
}

/** Alpana: a lotus rosette of eight petals inside two rings, with dots between tiles. */
function alpana(c: string) {
  const petals = Array.from({ length: 8 }, (_, i) => `<path d='M48 48 C 42 36 44 26 48 20 C 52 26 54 36 48 48 Z' transform='rotate(${i * 45} 48 48)'/>`).join("");
  return svg(
    `<g fill='none' stroke='${c}' stroke-width='1.4'>${petals}<circle cx='48' cy='48' r='31'/><circle cx='48' cy='48' r='35' stroke-dasharray='2 4'/></g>` +
      `<circle cx='48' cy='48' r='3.5' fill='${c}'/><g fill='${c}'><circle cx='0' cy='0' r='3'/><circle cx='96' cy='0' r='3'/><circle cx='0' cy='96' r='3'/><circle cx='96' cy='96' r='3'/></g>`,
    96,
  );
}

/** The style of the fixed background layer, or null for a plain page. `opacity` keeps every pattern subtle. */
export function backgroundLayer(background: Background, primary: string): { style: CSSProperties; className: string } | null {
  switch (background) {
    case "PLAIN":
      return null;
    case "GRADIENT":
      return {
        className: "opacity-[0.16] dark:opacity-[0.22]",
        style: {
          backgroundImage:
            "radial-gradient(40rem 28rem at 8% 0%, var(--site-gradient-a), transparent 70%), radial-gradient(36rem 26rem at 100% 35%, var(--site-gradient-b), transparent 70%), radial-gradient(30rem 22rem at 30% 100%, var(--site-accent), transparent 70%)",
        },
      };
    case "DOTS":
      return { className: "opacity-[0.18]", style: { backgroundImage: `radial-gradient(${primary} 1.2px, transparent 1.4px)`, backgroundSize: "22px 22px" } };
    case "GRID":
      return {
        className: "opacity-[0.10] dark:opacity-[0.14]",
        style: { backgroundImage: `linear-gradient(${primary} 1px, transparent 1px), linear-gradient(90deg, ${primary} 1px, transparent 1px)`, backgroundSize: "44px 44px" },
      };
    case "WAVES":
      return { className: "opacity-[0.12]", style: { backgroundImage: waves(primary) } };
    case "NAKSHI":
      return { className: "opacity-[0.11] dark:opacity-[0.16]", style: { backgroundImage: nakshi(primary) } };
    case "ALPANA":
      return { className: "opacity-[0.10] dark:opacity-[0.15]", style: { backgroundImage: alpana(primary) } };
  }
}

/** A small swatch of each background, for the editor. */
export function backgroundSwatch(background: Background, primary: string): CSSProperties {
  const layer = backgroundLayer(background, primary);
  return layer?.style ?? {};
}
