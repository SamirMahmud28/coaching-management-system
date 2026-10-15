import { describe, expect, it } from "vitest";
import {
  BODY_FONTS, DEFAULT_DESIGN, GRADIENTS, PALETTES, THEME_PRESETS, WEBSITE_FONTS, WEBSITE_THEMES, completeDesign, legacyDesign,
} from "@/server/modules/website/design";
import { THEMES } from "./themes";
import { DARK_BG, LIGHT_BG, contrast, ensureContrast, siteColours, siteVariables, textOn, textOnAll } from "./tokens";

describe("design catalogue", () => {
  it("has twelve themes, each with a signature and a preset of valid values", () => {
    expect(WEBSITE_THEMES).toHaveLength(12);
    for (const theme of WEBSITE_THEMES) {
      expect(THEMES[theme]).toBeDefined();
      const { headingFont, ...preset } = THEME_PRESETS[theme];
      expect(WEBSITE_FONTS).toContain(headingFont);
      expect(BODY_FONTS).toContain(preset.bodyFont);
      // A preset is a complete, valid design once the colours are added.
      expect(completeDesign({ ...preset, palette: "BRAND" })).toEqual({ ...DEFAULT_DESIGN, ...preset, palette: "BRAND" });
    }
    expect(THEME_PRESETS.MIDNIGHT.appearance).toBe("DARK");
  });

  it("has about thirty palettes with unique ids, including a Bangladesh family, and twelve gradients", () => {
    expect(PALETTES.length).toBeGreaterThanOrEqual(30);
    expect(new Set(PALETTES.map((p) => p.id)).size).toBe(PALETTES.length);
    expect(PALETTES.filter((p) => p.family === "BANGLADESH").length).toBeGreaterThanOrEqual(3);
    expect(GRADIENTS).toHaveLength(12);
    for (const p of PALETTES) expect([p.primary, p.accent]).toEqual([expect.stringMatching(/^#[0-9a-f]{6}$/), expect.stringMatching(/^#[0-9a-f]{6}$/)]);
  });

  it("completes a stored design: unknown values fall back, unknown keys are dropped", () => {
    expect(completeDesign({ palette: "NOPE", radius: "LARGE", bogus: 1, customPrimary: "#ABCDEF" })).toEqual({ ...DEFAULT_DESIGN, radius: "LARGE", customPrimary: "#abcdef" });
    expect(completeDesign(null)).toEqual(DEFAULT_DESIGN);
    expect(completeDesign({ customPrimary: "red" }).customPrimary).toBeNull();
  });

  it("keeps the look that sites saved before Website Pro had", () => {
    expect(legacyDesign("MODERN")).toMatchObject({ radius: "LARGE", cardStyle: "SHADOW", palette: "BRAND" });
    expect(legacyDesign("BOLD")).toMatchObject({ radius: "SMALL", cardStyle: "BORDER" });
    expect(legacyDesign("CLASSIC")).toEqual(DEFAULT_DESIGN);
  });
});

describe("readable colours (WCAG AA)", () => {
  it("every palette's colours read clearly as text on light and dark pages, and as button backgrounds", () => {
    for (const p of PALETTES) {
      for (const colour of [p.primary, p.accent]) {
        expect(contrast(ensureContrast(colour, LIGHT_BG), LIGHT_BG), `${p.id} ${colour} on light`).toBeGreaterThanOrEqual(4.5);
        expect(contrast(ensureContrast(colour, DARK_BG), DARK_BG), `${p.id} ${colour} on dark`).toBeGreaterThanOrEqual(4.5);
        expect(contrast(textOn(colour), colour), `${p.id} text on ${colour}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("text on every gradient reads at least at the large-text level across all its colours", () => {
    for (const g of GRADIENTS) {
      const ink = textOnAll(g.stops);
      expect(Math.min(...g.stops.map((s) => contrast(ink, s))), g.id).toBeGreaterThanOrEqual(3);
    }
  });

  it("fixes very light custom colours instead of trusting them", () => {
    const yellow = "#ffff00";
    expect(contrast(yellow, LIGHT_BG)).toBeLessThan(2);
    expect(contrast(ensureContrast(yellow, LIGHT_BG), LIGHT_BG)).toBeGreaterThanOrEqual(4.5);
    expect(textOn(yellow)).toBe("#111827");
  });

  it("takes colours from the palette, the custom colours, or the Settings brand colour", () => {
    expect(siteColours({ ...DEFAULT_DESIGN, palette: "OCEAN" }, "#ff0000").primary).toBe("#1d4ed8");
    expect(siteColours({ ...DEFAULT_DESIGN, palette: "CUSTOM", customPrimary: "#123456", customAccent: "#abcdef" }, null)).toMatchObject({ primary: "#123456", accent: "#abcdef" });
    expect(siteColours(DEFAULT_DESIGN, "#0a7f3f").primary).toBe("#0a7f3f");
    expect(siteColours(DEFAULT_DESIGN, null).primary).toBe("#2563eb");
    expect(siteColours({ ...DEFAULT_DESIGN, gradient: "EMBER" }, null).gradient).toEqual(["#dc2626", "#f59e0b"]);
  });

  it("sets the CSS variables the site's styles read", () => {
    const vars = siteVariables({ ...DEFAULT_DESIGN, palette: "SAFFRON", radius: "FULL", density: "SPACIOUS" }, null, "H", "B") as Record<string, string>;
    expect(vars["--site-primary"]).toBe("#ca8a04");
    expect(contrast(vars["--site-primary-ink-light"], LIGHT_BG)).toBeGreaterThanOrEqual(4.5);
    expect(vars["--site-button-radius"]).toBe("9999px");
    expect(vars["--site-space-lg"]).toBe("7rem");
    expect(vars["--site-heading"]).toBe("H");
  });
});
