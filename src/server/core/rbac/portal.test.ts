import { describe, expect, it } from "vitest";
import { ROLE_TEMPLATES, resolveTemplatePermissions } from "./catalog";
import { PORTAL_HOME, resolvePortal } from "./portal";

const perms = (name: string) => new Set<string>(resolveTemplatePermissions(ROLE_TEMPLATES.find((t) => t.name === name)!));

describe("resolvePortal", () => {
  it("sends the Instructor role to the instructor portal and the Student role to the student portal", () => {
    expect(resolvePortal(perms("Instructor"))).toBe("instructor");
    expect(resolvePortal(perms("Student"))).toBe("student");
  });

  it("keeps every management role on the admin portal", () => {
    for (const role of ["Owner", "Admin", "Accountant"]) expect(resolvePortal(perms(role)), role).toBe("admin");
  });

  it("keeps a permission-less user on the admin portal, which shows them nothing to manage", () => {
    expect(resolvePortal(new Set())).toBe("admin");
  });

  it("moves an instructor who is also granted any management permission to the admin portal", () => {
    expect(resolvePortal(new Set([...perms("Instructor"), "students.view"]))).toBe("admin");
    expect(resolvePortal(new Set([...perms("Instructor"), "student.self.view"]))).toBe("admin");
  });

  it("keeps the institute app under /app (D19)", () => {
    for (const home of Object.values(PORTAL_HOME)) expect(home.startsWith("/app")).toBe(true);
  });
});
