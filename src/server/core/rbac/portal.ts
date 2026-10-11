import { ROLE_TEMPLATES } from "./catalog";

/** Which experience an institute user lands in. Derived from permissions, so custom roles work too. */
export type PortalKind = "admin" | "instructor" | "student";

// The institute app lives under /app (D19).
export const PORTAL_HOME: Record<PortalKind, string> = {
  admin: "/app",
  instructor: "/app/instructor",
  student: "/app/student",
};

function templatePermissions(name: string): ReadonlySet<string> {
  return new Set(ROLE_TEMPLATES.find((t) => t.name === name)?.permissions ?? []);
}

const INSTRUCTOR_PERMISSIONS = templatePermissions("Instructor");
const STUDENT_PERMISSIONS = templatePermissions("Student");

/**
 * A user whose entire permission set fits inside the Instructor (or Student) role's is served that portal.
 * Anyone holding a single permission beyond it gets the admin portal, the only place those permissions have any UI.
 * Paid modules extend the Instructor and Student templates, and this follows automatically.
 */
export function resolvePortal(permissions: ReadonlySet<string>): PortalKind {
  if (permissions.size === 0) return "admin";
  const within = (allowed: ReadonlySet<string>) => [...permissions].every((p) => allowed.has(p));
  if (within(STUDENT_PERMISSIONS) && permissions.has("student.self.view")) return "student";
  if (within(INSTRUCTOR_PERMISSIONS) && permissions.has("batches.own.view")) return "instructor";
  return "admin";
}
