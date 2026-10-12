"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/** The Fees module's sections, each shown only with its permission (permissions are already limited to active modules). */
export function FeesTabs({ canGenerate, canReport }: { canGenerate: boolean; canReport: boolean }) {
  const pathname = usePathname();
  const tabs = [{ href: "/app/fees", label: "Fee setup" }, ...(canGenerate ? [{ href: "/app/fees/generate", label: "Generate charges" }] : []),
    ...(canReport ? [{ href: "/app/fees/reports", label: "Reports" }] : []),
  ];
  return (
    <nav aria-label="Fees sections" className="flex gap-1 border-b">
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
