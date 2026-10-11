import { CalendarCheck, CalendarClock, ClipboardList, Globe, Wallet, type LucideIcon } from "lucide-react";
import type { ModuleKey } from "@/server/core/modules/registry";
import type { PermissionName } from "@/server/core/rbac/catalog";

type PaidModuleKey = Exclude<ModuleKey, "core">;

/**
 * Admin navigation for each paid module, shown only when the module is active **and** the user holds its view
 * permission (permissions are already limited to active modules). Each module's own pages replace the placeholder.
 */
export const PAID_MODULE_NAV: Record<PaidModuleKey, { href: string; label: string; icon: LucideIcon; permission: PermissionName }> = {
  attendance: { href: "/app/attendance", label: "Attendance", icon: CalendarCheck, permission: "attendance.view" },
  routine: { href: "/app/routine", label: "Routine", icon: CalendarClock, permission: "routine.view" },
  exams: { href: "/app/exams", label: "Exams", icon: ClipboardList, permission: "exams.view" },
  fees: { href: "/app/fees", label: "Fees", icon: Wallet, permission: "fees.view" },
  website: { href: "/app/website", label: "Website", icon: Globe, permission: "website.manage" },
};

export const isPaidModuleKey = (key: string): key is PaidModuleKey => Object.hasOwn(PAID_MODULE_NAV, key);
