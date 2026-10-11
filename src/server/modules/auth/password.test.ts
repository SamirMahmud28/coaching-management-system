import { describe, expect, it } from "vitest";
import { hashPassword, passwordProblem, verifyPassword } from "./password";

describe("passwordProblem", () => {
  it("accepts 8–72 characters with at least one letter and one digit", () => {
    expect(passwordProblem("abcdefg1")).toBeNull();
    expect(passwordProblem(`a1${"x".repeat(70)}`)).toBeNull();
  });

  it("rejects passwords that are too short or too long", () => {
    expect(passwordProblem("abc1")).toMatch(/at least 8/);
    expect(passwordProblem(`a1${"x".repeat(71)}`)).toMatch(/at most 72/);
  });

  it("requires a letter and a digit", () => {
    expect(passwordProblem("12345678")).toMatch(/letter/);
    expect(passwordProblem("abcdefgh")).toMatch(/digit/);
  });
});

describe("hashPassword / verifyPassword", () => {
  it("produces an Argon2id hash that verifies only the right password", async () => {
    const hash = await hashPassword("Correct123");
    expect(hash).toMatch(/^\$argon2id\$/);
    expect(await verifyPassword(hash, "Correct123")).toBe(true);
    expect(await verifyPassword(hash, "Wrong1234")).toBe(false);
  });

  it("salts every hash, so the same password never produces the same hash twice", async () => {
    expect(await hashPassword("Same12345")).not.toBe(await hashPassword("Same12345"));
  });

  it("treats a malformed stored hash as a mismatch, not a crash", async () => {
    expect(await verifyPassword("not-a-hash", "Anything1")).toBe(false);
  });
});
