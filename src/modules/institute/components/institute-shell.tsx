"use client";

import { BookOpen, CalendarCheck, CalendarOff, CircleHelp, ClipboardList, GraduationCap, LayoutDashboard, PauseCircle, ScrollText, Settings, ToggleLeft, UserRound, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { AppShell, type NavItem } from "@/components/shell/app-shell";
import { Badge } from "@/components/ui/badge";
import type { PortalKind } from "@/server/core/rbac/portal";
import { instituteApi } from "../api";
import { PAID_MODULE_NAV } from "../modules";

const PORTAL_BADGE: Record<PortalKind, string | null> = { admin: null, instructor: "Instructor portal", student: "Student portal" };

/**
 * Navigation per portal, built from permissions that are already limited to the institute's active modules, so a
 * link appears only when its page would open (unlike the EMS, which listed modules regardless of permission).
 */
function buildNav(portal: PortalKind, permissions: ReadonlySet<string>): NavItem[] {
  if (portal === "instructor") {
    return [
      { href: "/app/instructor", label: "Dashboard", icon: LayoutDashboard, exact: true },
      ...(permissions.has("attendance.view") ? [{ href: "/app/instructor/attendance", label: "Attendance", icon: CalendarCheck }] : []),
      ...(permissions.has("exams.view") ? [{ href: "/app/instructor/exams", label: "Exams", icon: ClipboardList }] : []),
    ];
  }
  if (portal === "student") {
    return [
      { href: "/app/student", label: "Dashboard", icon: LayoutDashboard, exact: true },
      ...(permissions.has("leave.self.apply") ? [{ href: "/app/student/leave", label: "Leave", icon: CalendarOff }] : []),
    ];
  }
  const can = (p: string) => permissions.has(p);
  return [
    { href: "/app", label: "Dashboard", icon: LayoutDashboard, exact: true },
    ...(can("students.view") ? [{ href: "/app/students", label: "Students", icon: UserRound }] : []),
    ...(can("academic.view") ? [{ href: "/app/courses", label: "Courses & batches", icon: BookOpen }] : []),
    ...(can("instructors.view") ? [{ href: "/app/instructors", label: "Instructors", icon: GraduationCap }] : []),
    ...Object.values(PAID_MODULE_NAV).filter((m) => can(m.permission)),
    ...(can("users.view") ? [{ href: "/app/users", label: "Users", icon: Users }] : []),
    ...(can("modules.view") ? [{ href: "/app/modules", label: "Modules", icon: ToggleLeft }] : []),
    ...(can("audit.view") ? [{ href: "/app/audit-log", label: "Audit log", icon: ScrollText }] : []),
    ...(can("settings.manage") ? [{ href: "/app/settings", label: "Settings", icon: Settings }] : []),
    { href: "/app/help", label: "Help", icon: CircleHelp },
  ];
}

export function InstituteShell({
  portal,
  instituteName,
  suspended,
  permissions,
  user,
  children,
}: {
  portal: PortalKind;
  instituteName: string;
  suspended: boolean;
  permissions: string[];
  user: { name: string; email: string | null };
  children: React.ReactNode;
}) {
  const router = useRouter();
  const nav = buildNav(portal, new Set(permissions));
  const badge = PORTAL_BADGE[portal];

  async function signOut() {
    try {
      await instituteApi.signOut();
    } finally {
      router.replace("/login");
      router.refresh();
    }
  }

  return (
    <AppShell
      nav={nav}
      appLabel={instituteName}
      appBadge={badge ? <Badge variant="secondary">{badge}</Badge> : null}
      user={user}
      onSignOut={signOut}
      banner={
        suspended ? (
          <div role="status" className="flex items-center gap-3 border-b border-warning/40 bg-warning/15 px-4 py-2 text-sm">
            <PauseCircle className="size-4 shrink-0" />
            This institute&apos;s account is suspended. You can view information, but nothing can be created or changed.
          </div>
        ) : null
      }
    >
      {children}
    </AppShell>
  );
}
