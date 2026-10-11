import { describe, expect, it } from "vitest";
import { containsPattern } from "./search";

describe("containsPattern", () => {
  it("wraps the term for a contains match", () => {
    expect(containsPattern("green")).toBe("%green%");
  });

  it("escapes LIKE wildcards so they match literally", () => {
    expect(containsPattern("50%_off\\")).toBe("%50\\%\\_off\\\\%");
  });
});
