"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/** The Exams module's sections, each shown only with its permission (permissions are already limited to active modules). */
export function ExamsTabs({ canManage }: { canManage: boolean }) {
  const pathname = usePathname();
  if (!canManage) return null;
  const tabs = [
    { href: "/app/exams", label: "Exams" },
    { href: "/app/exams/grading", label: "Grading scale" },
  ];
  return (
    <nav aria-label="Exams sections" className="flex gap-1 overflow-x-auto border-b">
      {tabs.map((t) => {
        const active = pathname === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={cn("-mb-px shrink-0 border-b-2 px-3 py-2 text-sm", active ? "border-primary font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}

export const EXAM_STATE = {
  DRAFT: { label: "Draft", tone: "warning" as const },
  PUBLISHED: { label: "Published", tone: "success" as const },
};
