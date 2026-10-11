import { describe, expect, it } from "vitest";
import { normalizeBdMobile } from "./bd-phone";

describe("normalizeBdMobile", () => {
  it("accepts the local and international forms", () => {
    for (const raw of ["01712345678", "+8801712345678", "8801712345678", "017 1234-5678"]) {
      expect(normalizeBdMobile(raw), raw).toBe("01712345678");
    }
  });

  it("rejects numbers that aren't BD mobiles", () => {
    for (const raw of ["0171234567", "01212345678", "1712345678", "abc", "", "STU-2026-0001"]) {
      expect(normalizeBdMobile(raw), raw).toBeNull();
    }
  });
});
