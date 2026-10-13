"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/app/website", label: "Design" },
  { href: "/app/website/notices", label: "Notices" },
  { href: "/app/website/gallery", label: "Gallery" },
  { href: "/app/website/testimonials", label: "Testimonials" },
];

/** The Website module's sections. */
export function WebsiteTabs() {
  const pathname = usePathname();
  return (
    <nav aria-label="Website sections" className="flex gap-1 overflow-x-auto border-b">
      {TABS.map((t) => {
        const active = t.href === "/app/website" ? pathname === t.href : pathname.startsWith(t.href);
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
