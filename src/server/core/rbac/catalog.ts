import type { ModuleKey } from "../modules/registry";

/**
 * Every permission names the module that owns it. Core is itself an always-on module, so the authorization guard
 * can always derive the module from the permission and never skip the module check (docs/04-ARCHITECTURE.md §6).
 * Paid modules get their full permission sets when each module is built; until then each has a placeholder view.
 */
export const PERMISSION_CATALOG = [
  // Core: institute administration
  { name: "audit.view", module: "core" },
  { name: "modules.view", module: "core" },
  { name: "users.view", module: "core" },
  { name: "users.manage", module: "core" },
  { name: "roles.manage", module: "core" },
  { name: "settings.manage", module: "core" },
  // Core: courses, subjects, batches and their schedules (D3, D7, D25)
  { name: "academic.view", module: "core" },
  { name: "academic.manage", module: "core" },
  // Core: instructors (D1)
  { name: "instructors.view", module: "core" },
  { name: "instructors.manage", module: "core" },
  { name: "instructors.status", module: "core" },
  // Core: students (D1, D8–D14). Guardian and contact details are a separate grant (D24: not for instructors).
  { name: "students.view", module: "core" },
  { name: "students.contact.view", module: "core" },
  { name: "students.create", module: "core" },
  { name: "students.update", module: "core" },
  { name: "students.status", module: "core" },
  { name: "students.batches.manage", module: "core" },
  // Core: portals. An instructor's own batches and their students (D24); a student's own records (D27).
  { name: "batches.own.view", module: "core" },
  { name: "student.self.view", module: "core" },
  // Paid modules (placeholders until each module is built)
  { name: "attendance.view", module: "attendance" },
  { name: "routine.view", module: "routine" },
  { name: "exams.view", module: "exams" },
  { name: "fees.view", module: "fees" },
  { name: "website.manage", module: "website" },
] as const satisfies readonly { name: string; module: ModuleKey }[];

export type PermissionName = (typeof PERMISSION_CATALOG)[number]["name"];

const MODULE_BY_PERMISSION = new Map<string, ModuleKey>(PERMISSION_CATALOG.map((p) => [p.name, p.module]));

/** The module that owns a permission. Throws for an unknown name, which is a programming error. */
export function moduleOfPermission(permission: PermissionName): ModuleKey {
  const owner = MODULE_BY_PERMISSION.get(permission);
  if (!owner) throw new Error(`Unknown permission "${permission}"`);
  return owner;
}

export interface RoleTemplate {
  name: string;
  // Includes permissions added by later modules.
  grantsAll: boolean;
  permissions: readonly PermissionName[];
}

export const INSTITUTE_OWNER_ROLE = "Owner";

/** System roles created for every new institute. Instructor follows D24, Student follows D27. */
export const ROLE_TEMPLATES: readonly RoleTemplate[] = [
  { name: INSTITUTE_OWNER_ROLE, grantsAll: true, permissions: [] },
  { name: "Admin", grantsAll: true, permissions: [] },
  { name: "Accountant", grantsAll: false, permissions: ["academic.view", "students.view", "students.contact.view"] },
  { name: "Instructor", grantsAll: false, permissions: ["batches.own.view"] },
  { name: "Student", grantsAll: false, permissions: ["student.self.view"] },
];

export function resolveTemplatePermissions(template: RoleTemplate): PermissionName[] {
  return template.grantsAll ? PERMISSION_CATALOG.map((p) => p.name) : [...template.permissions];
}
