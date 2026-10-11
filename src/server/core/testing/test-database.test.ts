import { describe, expect, it } from "vitest";
import { assertTestDatabaseUrl } from "./test-database";

describe("assertTestDatabaseUrl", () => {
  it("accepts a database whose name ends in _test", () => {
    expect(assertTestDatabaseUrl("postgresql://app:app@localhost:5432/cms_test")).toBe("cms_test");
  });

  it("refuses the development database", () => {
    expect(() => assertTestDatabaseUrl("postgresql://app:app@localhost:5432/cms")).toThrow(/must end in _test/);
  });

  it("refuses a missing or malformed URL", () => {
    expect(() => assertTestDatabaseUrl(undefined)).toThrow(/not set/);
    expect(() => assertTestDatabaseUrl("not a url")).toThrow(/valid URL/);
  });
});
