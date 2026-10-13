import { describe, expect, it } from "vitest";
import { MODULE_KEYS } from "../modules/registry";
import { INSTITUTE_OWNER_ROLE, PERMISSION_CATALOG, ROLE_TEMPLATES, moduleOfPermission, resolveTemplatePermissions } from "./catalog";

const catalogNames = PERMISSION_CATALOG.map((p) => p.name);
const of = (name: string) => resolveTemplatePermissions(ROLE_TEMPLATES.find((r) => r.name === name)!);

describe("permission catalog", () => {
  it("uses the resource.action format", () => {
    for (const name of catalogNames) expect(name).toMatch(/^[a-z_]+(\.[a-z_]+)+$/);
  });

  it("has no duplicate permissions", () => {
    expect(new Set(catalogNames).size).toBe(catalogNames.length);
  });

  it("gives every permission a registered module, so the guard can always derive one", () => {
    for (const p of PERMISSION_CATALOG) expect(MODULE_KEYS).toContain(p.module);
  });

  it("looks up a permission's module, and refuses an unknown permission", () => {
    expect(moduleOfPermission("students.view")).toBe("core");
    expect(moduleOfPermission("fees.view")).toBe("fees");
    expect(() => moduleOfPermission("nope.view" as never)).toThrow(/Unknown permission/);
  });
});

describe("role templates", () => {
  it("has unique role names", () => {
    const names = ROLE_TEMPLATES.map((r) => r.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("only grants permissions that exist in the catalog", () => {
    for (const role of ROLE_TEMPLATES) {
      for (const perm of role.permissions) expect(catalogNames).toContain(perm);
    }
  });

  it("gives the Owner and Admin every permission, so no grant can ever exceed the Owner's", () => {
    expect(of(INSTITUTE_OWNER_ROLE).sort()).toEqual([...catalogNames].sort());
    expect(of("Admin").sort()).toEqual([...catalogNames].sort());
  });

  it("keeps instructors to their own batches: no guardian contacts, student admin, fees or settings (D24)", () => {
    const instructor = of("Instructor");
    expect(instructor).toContain("batches.own.view");
    for (const forbidden of ["students.contact.view", "students.create", "students.update", "students.status", "fees.view", "settings.manage"]) {
      expect(instructor).not.toContain(forbidden);
    }
  });

  it("limits students to their own records (D27)", () => {
    expect(of("Student")).toEqual(["student.self.view", "fees.self.view", "attendance.self.view", "leave.self.apply", "exams.self.view"]);
  });
});
