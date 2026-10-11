import { describe, expect, it } from "vitest";
import { activeTab } from "./utils";

describe("activeTab", () => {
  const tabs = [{ href: "/students" }, { href: "/students/promotion" }, { href: "/students/id-cards" }];

  it("matches a tab exactly, and the deepest tab a page sits under", () => {
    expect(activeTab("/students", tabs)).toBe("/students");
    expect(activeTab("/students/promotion", tabs)).toBe("/students/promotion");
    expect(activeTab("/students/3f1c2b7e-0000-4000-8000-000000000000", tabs)).toBe("/students");
  });

  it("doesn't match a path that only shares a prefix", () => {
    expect(activeTab("/studentship", tabs)).toBeUndefined();
  });
});
