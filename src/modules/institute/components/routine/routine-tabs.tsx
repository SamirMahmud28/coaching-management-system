"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/** The Routine module's sections: the routine itself and lesson plans. `base` is the admin panel's or the instructor portal's. */
export function RoutineTabs({ base }: { base: string }) {
  const pathname = usePathname();
  const tabs = [
    { href: base, label: "Routine", active: pathname === base },
    { href: `${base}/lessons`, label: "Lesson plans", active: pathname.startsWith(`${base}/lessons`) },
  ];
  return (
    <nav aria-label="Routine sections" className="flex gap-1 border-b">
      {tabs.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          aria-current={t.active ? "page" : undefined}
          className={cn("-mb-px border-b-2 px-3 py-2 text-sm", t.active ? "border-primary font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
