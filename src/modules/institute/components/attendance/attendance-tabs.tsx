"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/**
 * The Attendance module's sections, each shown only with its permission (permissions are already limited to active
 * modules). `base` is the admin panel's or the instructor portal's Attendance page; leave is the office's only.
 */
export function AttendanceTabs({ base = "/app/attendance", canManageLeave = false, canReport = false }: { base?: string; canManageLeave?: boolean; canReport?: boolean }) {
  const pathname = usePathname();
  const tabs = [
    { href: base, label: "Classes" },
    ...(canManageLeave ? [{ href: `${base}/leave`, label: "Leave" }] : []),
    ...(canReport ? [{ href: `${base}/reports`, label: "Reports" }] : []),
  ];
  if (tabs.length < 2) return null;
  return (
    <nav aria-label="Attendance sections" className="flex gap-1 border-b">
      {tabs.map((t) => {
        const active = pathname === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={cn("-mb-px border-b-2 px-3 py-2 text-sm", active ? "border-primary font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
