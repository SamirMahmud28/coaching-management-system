import { describe, expect, it } from "vitest";
import { validEmail } from "./platform-admin-input";

describe("validEmail", () => {
  it("accepts ordinary addresses", () => {
    expect(validEmail("root@platform.test")).toBe(true);
    expect(validEmail("first.last+tag@sub.example.co")).toBe(true);
  });

  it("rejects malformed input", () => {
    for (const bad of ["", "not-an-email", "missing-domain@", "@missing-local.com", "spaces in@email.com", "double@@at.com"]) {
      expect(validEmail(bad)).toBe(false);
    }
  });
});
