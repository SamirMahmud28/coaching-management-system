"use client";

import { useQuery } from "@tanstack/react-query";
import {
  BookOpen,
  CalendarCheck,
  CalendarClock,
  CalendarOff,
  CircleHelp,
  ClipboardList,
  GraduationCap,
  LayoutDashboard,
  Megaphone,
  PauseCircle,
  ScrollText,
  Settings,
  ToggleLeft,
  Trophy,
  UserPlus,
  UserRound,
  Users,
  Wallet,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { AppShell, type NavItem } from "@/components/shell/app-shell";
import type { PaletteAction, PaletteSearch } from "@/components/shell/command-palette";
import type { AppTheme } from "@/lib/app-themes";
import type { PortalKind } from "@/server/core/rbac/portal";
import { enquiriesApi, instituteApi, leaveApi, studentsApi } from "../api";
import { instituteKeys } from "../keys";
import { PAID_MODULE_NAV } from "../modules";

const PORTAL_BADGE: Record<PortalKind, string | null> = { admin: null, instructor: "Instructor portal", student: "Student portal" };

const DAILY = "Daily work";
const SETUP = "Setup";
const SYSTEM = "System";

/**
 * Navigation per portal, built from permissions that are already limited to the institute's active modules, so a
 * link appears only when its page would open (unlike the EMS, which listed modules regardless of permission). The
 * office menu is grouped by how often each page is used (D152).
 */
function buildNav(portal: PortalKind, permissions: ReadonlySet<string>): NavItem[] {
  if (portal === "instructor") {
    return [
      { href: "/app/instructor", label: "Dashboard", short: "Home", icon: LayoutDashboard, exact: true },
      ...(permissions.has("attendance.view") ? [{ href: "/app/instructor/attendance", label: "Attendance", icon: CalendarCheck }] : []),
      ...(permissions.has("exams.view") ? [{ href: "/app/instructor/exams", label: "Exams", icon: ClipboardList }] : []),
      ...(permissions.has("routine.view") ? [{ href: "/app/instructor/routine", label: "Routine", icon: CalendarClock }] : []),
    ];
  }
  if (portal === "student") {
    return [
      { href: "/app/student", label: "Dashboard", short: "Home", icon: LayoutDashboard, exact: true },
      ...(permissions.has("leave.self.apply") ? [{ href: "/app/student/leave", label: "Leave", icon: CalendarOff }] : []),
      ...(permissions.has("exams.self.view") ? [{ href: "/app/student/results", label: "Results", icon: Trophy }] : []),
    ];
  }
  const can = (p: string) => permissions.has(p);
  const mod = (key: keyof typeof PAID_MODULE_NAV, group: string): NavItem[] =>
    can(PAID_MODULE_NAV[key].permission) ? [{ ...PAID_MODULE_NAV[key], group }] : [];
  return [
    { href: "/app", label: "Dashboard", short: "Home", icon: LayoutDashboard, exact: true },
    ...(can("students.view") ? [{ href: "/app/students", label: "Students", icon: UserRound, group: DAILY }] : []),
    ...mod("attendance", DAILY),
    ...mod("fees", DAILY),
    ...mod("exams", DAILY),
    ...mod("routine", DAILY),
    ...(can("academic.view") ? [{ href: "/app/courses", label: "Courses & batches", short: "Courses", icon: BookOpen, group: SETUP }] : []),
    ...(can("instructors.view") ? [{ href: "/app/instructors", label: "Instructors", icon: GraduationCap, group: SETUP }] : []),
    ...mod("website", SETUP),
    ...(can("users.view") ? [{ href: "/app/users", label: "Users", icon: Users, group: SYSTEM }] : []),
    ...(can("modules.view") ? [{ href: "/app/modules", label: "Modules", icon: ToggleLeft, group: SYSTEM }] : []),
    ...(can("audit.view") ? [{ href: "/app/audit-log", label: "Audit log", icon: ScrollText, group: SYSTEM }] : []),
    ...(can("settings.manage") ? [{ href: "/app/settings", label: "Settings", icon: Settings, group: SYSTEM }] : []),
    { href: "/app/help", label: "Help", icon: CircleHelp, group: SYSTEM },
  ];
}

/** Common tasks for the command palette, each only for those who may do it. */
function buildActions(portal: PortalKind, permissions: ReadonlySet<string>): PaletteAction[] {
  if (portal !== "admin") return [];
  const can = (p: string) => permissions.has(p);
  return [
    ...(can("students.create") ? [{ href: "/app/students/new", label: "Admit a student", icon: UserPlus, keywords: "new admission enrol" }] : []),
    ...(can("fees.collect") ? [{ href: "/app/fees/collect", label: "Collect a fee", icon: Wallet, keywords: "payment receipt money" }] : []),
    ...(can("attendance.take") ? [{ href: "/app/attendance", label: "Take attendance", icon: CalendarCheck, keywords: "register present absent" }] : []),
    ...(can("leave.manage") ? [{ href: "/app/attendance/leave", label: "Review leave requests", icon: CalendarOff, keywords: "approve reject" }] : []),
    ...(can("exams.manage") ? [{ href: "/app/exams/new", label: "Create an exam", icon: ClipboardList, keywords: "test marks" }] : []),
    ...(can("website.manage") ? [{ href: "/app/website/notices", label: "Post a notice", icon: Megaphone, keywords: "announcement website" }] : []),
  ];
}

/** "Needs attention" counts beside menu items, from lists the user can already open; refreshed with those pages. */
function useAttentionCounts(portal: PortalKind, permissions: ReadonlySet<string>) {
  const admin = portal === "admin";
  const leave = useQuery({
    queryKey: instituteKeys.leave({ status: "PENDING" }),
    queryFn: () => leaveApi.list({ status: "PENDING" }),
    enabled: admin && permissions.has("leave.manage"),
    staleTime: 60_000,
  });
  const enquiries = useQuery({
    queryKey: instituteKeys.website("enquiries", "NEW"),
    queryFn: () => enquiriesApi.list("NEW"),
    enabled: admin && permissions.has("website.manage"),
    staleTime: 60_000,
  });
  return {
    [PAID_MODULE_NAV.attendance.href]: leave.data?.length ?? 0,
    [PAID_MODULE_NAV.website.href]: enquiries.data?.counts.NEW ?? 0,
  } as Record<string, number>;
}

export function InstituteShell({
  portal,
  instituteName,
  logoUrl,
  appTheme,
  paper,
  suspended,
  permissions,
  user,
  children,
}: {
  portal: PortalKind;
  instituteName: string;
  logoUrl?: string | null;
  appTheme?: AppTheme;
  paper?: boolean;
  suspended: boolean;
  permissions: string[];
  user: { name: string; email: string | null };
  children: React.ReactNode;
}) {
  const router = useRouter();
  const granted = new Set(permissions);
  const counts = useAttentionCounts(portal, granted);
  const nav = buildNav(portal, granted).map((n) => (counts[n.href] ? { ...n, badge: counts[n.href] } : n));
  const badge = PORTAL_BADGE[portal];

  // Office phones: Home, Students and the two busiest daily pages the user has; "More" opens the full menu.
  const tabs =
    portal === "admin"
      ? ["/app", "/app/students", PAID_MODULE_NAV.attendance.href, PAID_MODULE_NAV.fees.href, PAID_MODULE_NAV.exams.href]
          .filter((h) => nav.some((n) => n.href === h))
          .slice(0, 4)
      : undefined;

  const search: PaletteSearch | undefined =
    portal === "admin" && granted.has("students.view")
      ? {
          label: "Students",
          placeholder: granted.has("students.contact.view") ? "Search students by name, ID or mobile, or a page…" : "Search students by name or ID, or a page…",
          run: async (q) => {
            const res = await studentsApi.list({ q, status: "ALL", page_size: 6 });
            return res.items.map((s) => ({
              id: s.id,
              href: `/app/students/${s.id}`,
              title: s.full_name,
              subtitle: s.student_code,
            }));
          },
        }
      : undefined;

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
      brand={{ name: instituteName, logoUrl, caption: badge ?? "Office" /* names the portal; shown in the sidebar and the phone menu */ }}
      theme={appTheme}
      paper={paper}
      themeHref={granted.has("settings.manage") ? "/app/settings#appearance" : undefined}
      tabs={tabs}
      actions={buildActions(portal, granted)}
      search={search}
      changePasswordHref="/change-password"
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
