"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/** The Attendance module's sections in the admin panel, each shown only with its permission. */
export function AttendanceTabs({ canManageLeave }: { canManageLeave: boolean }) {
  const pathname = usePathname();
  if (!canManageLeave) return null;
  const tabs = [
    { href: "/app/attendance", label: "Classes" },
    { href: "/app/attendance/leave", label: "Leave" },
  ];
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
