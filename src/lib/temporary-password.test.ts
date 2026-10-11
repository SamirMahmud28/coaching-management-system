import { describe, expect, it } from "vitest";
import { passwordProblem } from "./password-rule";
import { generateTemporaryPassword } from "./temporary-password";

describe("generateTemporaryPassword", () => {
  it("is 12 characters with at least one letter and one digit, every time", () => {
    for (let i = 0; i < 2000; i++) {
      const pw = generateTemporaryPassword();
      expect(pw).toHaveLength(12);
      expect(pw).toMatch(/[A-Za-z]/);
      expect(pw).toMatch(/[0-9]/);
      expect(passwordProblem(pw)).toBeNull(); // always accepted by the server's rule
    }
  });

  it("doesn't repeat", () => {
    const seen = new Set(Array.from({ length: 500 }, () => generateTemporaryPassword()));
    expect(seen.size).toBe(500);
  });
});
