import { describe, expect, it } from "vitest";
import { APP_THEME_KEYS, APP_THEMES, resolvePaper, themeAttribute } from "./app-themes";

describe("app themes", () => {
  it("lists every key once, Midnight first (the default)", () => {
    expect(APP_THEMES.map((t) => t.key)).toEqual([...APP_THEME_KEYS]);
    expect(APP_THEMES[0]!.key).toBe("MIDNIGHT");
  });

  it("puts no attribute for the default theme", () => {
    expect(themeAttribute("MIDNIGHT")).toBeUndefined();
    expect(themeAttribute("PLUM")).toBe("plum");
  });

  it("paper is automatic on with Classic Amber only; an explicit choice wins (D158)", () => {
    expect(APP_THEME_KEYS.filter((k) => resolvePaper(k, null))).toEqual(["AMBER"]);
    expect(resolvePaper("MIDNIGHT", true)).toBe(true);
    expect(resolvePaper("AMBER", false)).toBe(false);
  });
});
