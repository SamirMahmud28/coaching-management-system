"use client";

import { LogOut, Menu } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

export interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Highlight only on the exact path (a landing page that other nav paths sit under). */
  exact?: boolean;
}

export interface ShellUser {
  name: string;
  email?: string | null;
}

export function AppShell({
  nav,
  appLabel,
  appBadge,
  topbarExtra,
  user,
  onSignOut,
  banner,
  children,
}: {
  nav: NavItem[];
  appLabel: string;
  appBadge?: React.ReactNode;
  topbarExtra?: React.ReactNode;
  user: ShellUser;
  onSignOut: () => void;
  banner?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex min-h-screen flex-1">
      <aside className="hidden w-60 shrink-0 border-r bg-sidebar lg:flex lg:flex-col print:hidden">
        <div className="flex h-14 items-center border-b px-4">
          <Logo size="sm" />
        </div>
        <SidebarNav nav={nav} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="h-1 bg-brand-gradient print:hidden" aria-hidden />
        <header className="flex h-14 items-center gap-2 border-b px-4 print:hidden">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open navigation">
                <Menu />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 p-0">
              <SheetHeader className="border-b">
                <SheetTitle>
                  <Logo size="sm" />
                </SheetTitle>
              </SheetHeader>
              <SidebarNav nav={nav} onNavigate={() => setMobileOpen(false)} />
            </SheetContent>
          </Sheet>

          <span className="truncate text-sm font-medium">{appLabel}</span>
          {appBadge}

          <div className="ml-auto flex items-center gap-2">
            {topbarExtra}
            <ThemeToggle />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="gap-2 px-2" aria-label="Account menu">
                  <span className="flex size-7 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary-strong">
                    {initials(user.name)}
                  </span>
                  <span className="hidden max-w-40 truncate text-sm sm:inline">{user.name}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="font-normal">
                  <div className="truncate text-sm font-medium">{user.name}</div>
                  {user.email && <div className="truncate text-xs text-muted-foreground">{user.email}</div>}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={onSignOut}>
                  <LogOut /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <div className="print:hidden">{banner}</div>
        <main className="mx-auto w-full max-w-7xl flex-1 space-y-6 p-4 md:p-6 print:max-w-none print:p-0">{children}</main>
      </div>
    </div>
  );
}

function SidebarNav({ nav, onNavigate }: { nav: NavItem[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-1 p-3">
      {nav.map(({ href, label, icon: Icon, exact }) => {
        const active = pathname === href || (!exact && pathname.startsWith(`${href}/`));
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
              active && "bg-primary/10 text-primary-strong hover:bg-primary/15 hover:text-primary-strong",
            )}
          >
            <Icon className="size-4" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}
