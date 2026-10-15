import type { ModuleKey } from "../modules/registry";

/**
 * Every permission names the module that owns it. Core is itself an always-on module, so the authorization guard
 * can always derive the module from the permission and never skip the module check.
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
  // Core: courses, subjects, batches and their schedules
  { name: "academic.view", module: "core" },
  { name: "academic.manage", module: "core" },
  // Core: instructors
  { name: "instructors.view", module: "core" },
  { name: "instructors.manage", module: "core" },
  { name: "instructors.status", module: "core" },
  // Core: students. Guardian and contact details are a separate grant (not for instructors).
  { name: "students.view", module: "core" },
  { name: "students.contact.view", module: "core" },
  { name: "students.create", module: "core" },
  { name: "students.update", module: "core" },
  { name: "students.status", module: "core" },
  { name: "students.batches.manage", module: "core" },
  // Core: portals. An instructor's own batches and their students; a student's own records.
  { name: "batches.own.view", module: "core" },
  { name: "student.self.view", module: "core" },
  // Paid modules (a placeholder until Website is built; the others are below)
  { name: "website.manage", module: "website" },
  // Routine & Lesson Plans. Instructors' grants reach only their own batches and subjects.
  { name: "routine.view", module: "routine" },
  // Schedule changes and holidays: Owner/Admin only.
  { name: "routine.manage", module: "routine" },
  { name: "lessons.manage", module: "routine" },
  // A student's own week with changes and lesson progress.
  { name: "routine.self.view", module: "routine" },
  // Exams & Results. Instructors' grants reach only their own batches and subjects (checked per request).
  { name: "exams.view", module: "exams" },
  { name: "exams.manage", module: "exams" },
  { name: "exams.marks.enter", module: "exams" },
  // Only Owner/Admin publish, and correct marks after publishing with a reason.
  { name: "exams.publish", module: "exams" },
  // A student's own published results.
  { name: "exams.self.view", module: "exams" },
  // Attendance & Leave. Instructors' grants reach only their own batch subjects (checked per request).
  { name: "attendance.view", module: "attendance" },
  { name: "attendance.take", module: "attendance" },
  { name: "attendance.manage", module: "attendance" },
  { name: "attendance.report.view", module: "attendance" },
  { name: "leave.manage", module: "attendance" },
  // A student's own attendance and leave.
  { name: "attendance.self.view", module: "attendance" },
  { name: "leave.self.apply", module: "attendance" },
  // Fees & Payments. Waivers, voids and refunds are kept apart for separation of duties.
  { name: "fees.view", module: "fees" },
  { name: "fees.configure", module: "fees" },
  { name: "fees.generate", module: "fees" },
  { name: "fees.collect", module: "fees" },
  { name: "fees.adjust", module: "fees" },
  { name: "fees.waive", module: "fees" },
  { name: "fees.payment.void", module: "fees" },
  { name: "fees.refund", module: "fees" },
  { name: "fees.report.view", module: "fees" },
  // A student's own fees, dues and receipts.
  { name: "fees.self.view", module: "fees" },
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

/**
 * System roles created for every new institute. Accountant follows and (and has no exam access, as the exam plan
 * sets), Instructor and, Student and.
 */
export const ROLE_TEMPLATES: readonly RoleTemplate[] = [
  { name: INSTITUTE_OWNER_ROLE, grantsAll: true, permissions: [] },
  { name: "Admin", grantsAll: true, permissions: [] },
  {
    name: "Accountant",
    grantsAll: false,
    permissions: ["academic.view", "students.view", "students.contact.view", "fees.view", "fees.configure", "fees.generate", "fees.collect", "fees.adjust", "fees.report.view"],
  },
  { name: "Instructor", grantsAll: false, permissions: ["batches.own.view", "attendance.view", "attendance.take", "attendance.report.view", "exams.view", "exams.marks.enter", "routine.view", "lessons.manage"] },
  { name: "Student", grantsAll: false, permissions: ["student.self.view", "fees.self.view", "attendance.self.view", "leave.self.apply", "exams.self.view", "routine.self.view"] },
];

export function resolveTemplatePermissions(template: RoleTemplate): PermissionName[] {
  return template.grantsAll ? PERMISSION_CATALOG.map((p) => p.name) : [...template.permissions];
}
