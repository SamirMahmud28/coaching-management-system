import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { APP_THEMES } from "@/lib/app-themes";

/**
 * Every app theme's text pairs meet WCAG AA (4.5:1 for text; 3:1 for the focus ring), in light and dark mode (D152,
 * D155, D156). Read from globals.css so a token change that breaks contrast fails here.
 */
const css = readFileSync(path.join(process.cwd(), "src/app/globals.css"), "utf8").replace(/\r\n/g, "\n");

function block(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`no ${selector} block`);
  const body = css.slice(css.indexOf("{", start) + 1, css.indexOf("}", start));
  return Object.fromEntries([...body.matchAll(/--([\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
}

function luminance(hex: string): number {
  const m = hex.match(/^#([0-9a-f]{6})$/i);
  if (!m) throw new Error(`not a hex colour: ${hex}`);
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(m[1].slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

const rootLight = block(':root,\n.theme-light,\n[data-app-theme="midnight"]');
const rootDark = { ...rootLight, ...block('.dark,\n.dark [data-app-theme="midnight"]') };

/** The tokens in effect for a theme and mode, merged the way the cascade applies them. */
function tokens(theme: string, mode: "light" | "dark"): Record<string, string> {
  if (theme === "midnight") return mode === "light" ? rootLight : rootDark;
  const light = block(`[data-app-theme="${theme}"]`);
  if (mode === "light") return { ...rootLight, ...light };
  return { ...rootDark, ...light, ...block(`.dark[data-app-theme="${theme}"],\n.dark [data-app-theme="${theme}"]`) };
}

const TEXT_PAIRS: [string, string][] = [
  ["foreground", "background"],
  ["card-foreground", "card"],
  ["popover-foreground", "popover"],
  ["primary-foreground", "primary"],
  ["secondary-foreground", "secondary"],
  ["muted-foreground", "background"],
  ["muted-foreground", "card"],
  ["muted-foreground", "muted"],
  ["accent-foreground", "accent"],
  ["primary-strong", "card"],
  ["primary-strong", "background"],
  ["destructive", "card"],
  ["sidebar-foreground", "sidebar"],
  ["sidebar-muted-foreground", "sidebar"],
  ["sidebar-accent-foreground", "sidebar-accent"],
  ["sidebar-foreground", "sidebar-accent"],
  ["sidebar-primary-foreground", "sidebar-primary"],
];

const CASES = APP_THEMES.flatMap((t) => (["light", "dark"] as const).map((mode) => [t.key.toLowerCase(), mode] as const));

describe.each(CASES)("app theme %s (%s)", (theme, mode) => {
  const t = tokens(theme, mode);

  it.each(TEXT_PAIRS)("%s on %s is at least 4.5:1", (fg, bg) => {
    expect(contrast(t[fg]!, t[bg]!)).toBeGreaterThanOrEqual(4.5);
  });

  it("the focus ring stands out from the page (3:1)", () => {
    expect(contrast(t.ring!, t.background!)).toBeGreaterThanOrEqual(3);
  });
});

/** a mixed into b by `amount` (0..1), like CSS color-mix in srgb. */
function mix(a: string, b: string, amount: number): string {
  const ch = (hex: string, i: number) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
  return `#${[0, 1, 2].map((i) => Math.round(ch(a, i) * amount + ch(b, i) * (1 - amount)).toString(16).padStart(2, "0")).join("")}`;
}

describe.each(CASES)("paper background, app theme %s (%s) (D158)", (theme, mode) => {
  const t = tokens(theme, mode);
  // Worst case on the page: the 3% tinted base under the strongest 8% primary glow (titles and hints sit on it; cards are solid).
  const paper = mix(t.primary!, mix(t.primary!, t.background!, 0.03), 0.08);

  it.each(["foreground", "muted-foreground", "primary-strong"])("%s stays at least 4.5:1 on the paper", (fg) => {
    expect(contrast(t[fg]!, paper)).toBeGreaterThanOrEqual(4.5);
  });
});

/**
 * The backdrop's brightest or most tinted spots (D160): the paper base under each colour glow at full strength, and
 * under the edge vignette. Glass is composited over each of them.
 */
function backdropSpots(t: Record<string, string>, mode: "light" | "dark"): string[] {
  const base = mix(t.primary!, t.background!, mode === "light" ? 0.015 : 0.02);
  const [a, b, c] = mode === "light" ? [0.11, 0.12, 0.1] : [0.1, 0.08, 0.07];
  return [base, mix(t.primary!, base, a), mix(t["chart-2"]!, base, b), mix(t["chart-3"]!, base, c), mix(t.foreground!, base, 0.04)];
}

describe.each(CASES)("glass surfaces, app theme %s (%s) (D159)", (theme, mode) => {
  const t = tokens(theme, mode);
  const spots = backdropSpots(t, mode);
  const alpha = parseFloat(t["sidebar-glass-alpha"]!) / 100;

  it.each(["foreground", "muted-foreground", "primary-strong"])("%s stays at least 4.5:1 on a frosted card", (fg) => {
    for (const spot of spots) expect(contrast(t[fg]!, mix(t.card!, spot, 0.78))).toBeGreaterThanOrEqual(4.5);
  });

  it.each(["popover-foreground", "muted-foreground"])("%s stays at least 4.5:1 on a frosted menu or dialog", (fg) => {
    for (const spot of spots) expect(contrast(t[fg]!, mix(t.popover!, spot, 0.88))).toBeGreaterThanOrEqual(4.5);
  });

  it.each(["sidebar-foreground", "sidebar-muted-foreground"])("%s stays at least 4.5:1 on the glass sidebar", (fg) => {
    for (const spot of spots) expect(contrast(t[fg]!, mix(t["sidebar-glass-tint"]!, spot, alpha))).toBeGreaterThanOrEqual(4.5);
  });
});

it("every non-default theme has a light and a dark block", () => {
  for (const t of APP_THEMES.filter((x) => x.key !== "MIDNIGHT")) {
    expect(() => tokens(t.key.toLowerCase(), "dark")).not.toThrow();
  }
});
