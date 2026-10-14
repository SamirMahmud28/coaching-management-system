import { describe, expect, it } from "vitest";
import { DEFAULT_DESIGN, PALETTES, WEBSITE_FONTS, WEBSITE_THEMES, completeDesign } from "@/server/modules/website/design";
import { LOOKS, applyLook } from "./looks";

describe("ready-made looks (D146)", () => {
  it("offers about twenty distinct looks, each a valid, complete design", () => {
    expect(LOOKS.length).toBeGreaterThanOrEqual(20);
    expect(new Set(LOOKS.map((l) => l.id)).size).toBe(LOOKS.length);
    expect(new Set(LOOKS.map((l) => `${l.theme}/${l.palette}/${l.headingFont ?? ""}/${JSON.stringify(l.design ?? {})}`)).size).toBe(LOOKS.length);
    for (const look of LOOKS) {
      expect(WEBSITE_THEMES, look.id).toContain(look.theme);
      expect(PALETTES.map((p) => p.id), look.id).toContain(look.palette);
      const applied = applyLook(look, { ...DEFAULT_DESIGN, language: "BN" });
      expect(WEBSITE_FONTS, look.id).toContain(applied.headingFont);
      // Every value is one the server accepts, nothing is missing, and the language is kept.
      expect(completeDesign(applied.design), look.id).toEqual(applied.design);
      expect(applied.design.language).toBe("BN");
      expect(applied.design.palette).toBe(look.palette);
    }
  });
});
