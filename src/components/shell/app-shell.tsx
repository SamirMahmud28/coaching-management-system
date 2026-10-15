"use client";

import { Check, ChevronsLeft, ChevronsRight, KeyRound, LogOut, Menu, MoreHorizontal, Palette, Search } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fragment, useEffect, useMemo, useState } from "react";
import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { APP_THEMES, DEFAULT_APP_THEME, resolvePaper, themeAttribute, type AppTheme } from "@/lib/app-themes";
import { cn } from "@/lib/utils";
import { AppThemeContext, type AppThemeControl } from "./app-theme-context";
import { CommandPalette, Kbd, type PaletteAction, type PaletteSearch } from "./command-palette";
import { useSidebarCollapsed } from "./use-sidebar";

export interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Highlight only on the exact path (a landing page that other nav paths sit under). */
  exact?: boolean;
  /** Sidebar group heading, e.g. "Daily work". Items without one sit at the top. */
  group?: string;
  /** A "needs attention" count shown beside the item (hidden at 0). */
  badge?: number;
  /** A short label for the phone tab bar. */
  short?: string;
}

export interface ShellUser {
  name: string;
  email?: string | null;
}

/** Whose app this is: the institute's name and logo, or the product's for the Super Admin. */
export interface ShellBrand {
  name: string;
  logoUrl?: string | null;
  caption?: string;
}

export function AppShell({
  nav,
  appLabel,
  appBadge,
  topbarExtra,
  user,
  onSignOut,
  banner,
  brand,
  tabs,
  actions,
  search,
  changePasswordHref,
  theme = DEFAULT_APP_THEME,
  paper = "auto",
  themeHref,
  onThemeSave,
  children,
}: {
  nav: NavItem[];
  appLabel: string;
  appBadge?: React.ReactNode;
  topbarExtra?: React.ReactNode;
  user: ShellUser;
  onSignOut: () => void;
  banner?: React.ReactNode;
  brand?: ShellBrand;
  /** Hrefs of the nav items on the phone tab bar (up to 4; "More" opens the full menu). Defaults to the first four. */
  tabs?: string[];
  actions?: PaletteAction[];
  search?: PaletteSearch;
  changePasswordHref?: string;
  /** The app theme (D156, D157): the institute's, or the platform admin's own. */
  theme?: AppTheme;
  /** The paper background (D158): on, off, or "auto" to follow the theme (on with Classic Amber). */
  paper?: boolean | "auto";
  /** Where the theme is changed (Settings → Appearance), shown in the account menu. */
  themeHref?: string;
  /** Saves the user's own theme from the account menu (the Super Admin panel). */
  onThemeSave?: (theme: AppTheme) => Promise<void>;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [collapsed, setCollapsed] = useSidebarCollapsed();
  const [saved, setSaved] = useState<AppTheme>(theme);
  const [previewing, setPreviewing] = useState<AppTheme | null>(null);
  const shown = previewing ?? saved;
  const [savedPaper, setSavedPaper] = useState<boolean | "auto">(paper);
  const [previewingPaper, setPreviewingPaper] = useState<boolean | null>(null);
  const paperOn = previewingPaper ?? (savedPaper === "auto" ? resolvePaper(shown, null) : savedPaper);
  const themeControl = useMemo<AppThemeControl>(
    () => ({
      saved,
      shown,
      preview: setPreviewing,
      paper: paperOn,
      previewPaper: setPreviewingPaper,
      commit: (t, p) => {
        setSaved(t);
        setPreviewing(null);
        if (p !== undefined) setSavedPaper(p);
        setPreviewingPaper(null);
      },
    }),
    [saved, shown, paperOn],
  );

  // Dialogs and pop-ups render outside the shell, under <body>: the attribute on <html> gives them the same theme.
  useEffect(() => {
    const root = document.documentElement;
    const attr = themeAttribute(shown);
    if (attr) root.dataset.appTheme = attr;
    else delete root.dataset.appTheme;
    return () => {
      delete root.dataset.appTheme;
    };
  }, [shown]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const active = activeHref(pathname, nav);
  const current = nav.find((n) => n.href === active);
  const tabItems = (tabs ? tabs.map((h) => nav.find((n) => n.href === h)).filter((n): n is NavItem => !!n) : nav).slice(0, 4);
  const hasMore = nav.length > tabItems.length;

  return (
    <AppThemeContext.Provider value={themeControl}>
    <div
      data-app-theme={themeAttribute(shown)}
      data-paper={paperOn ? "on" : undefined}
      className={cn(
        "flex min-h-screen flex-1 bg-background text-foreground",
        tabItems.length > 1 && "[--app-bottom-inset:calc(4rem+env(safe-area-inset-bottom))] lg:[--app-bottom-inset:0px]",
      )}
    >
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-card px-3 py-2 text-sm font-medium shadow-lg focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>

      <aside
        className={cn(
          "sticky top-0 hidden h-screen shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground transition-[width] duration-200 lg:flex print:hidden",
          collapsed ? "w-[4.5rem]" : "w-64",
        )}
      >
        <div className={cn("flex h-16 items-center border-b border-sidebar-border", collapsed ? "justify-center px-2" : "px-4")}>
          <BrandBlock brand={brand} compact={collapsed} />
        </div>
        <SidebarNav nav={nav} active={active} collapsed={collapsed} />
        <div className={cn("border-t border-sidebar-border p-3", collapsed && "flex justify-center px-2")}>
          <Button
            variant="ghost"
            size={collapsed ? "icon" : "sm"}
            className={cn("text-sidebar-muted-foreground hover:bg-sidebar-hover hover:text-sidebar-foreground", !collapsed && "w-full justify-start")}
            onClick={() => setCollapsed(!collapsed)}
            aria-label={collapsed ? "Expand menu" : "Collapse menu"}
          >
            {collapsed ? <ChevronsRight /> : <ChevronsLeft />}
            {!collapsed && "Collapse"}
          </Button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="glass sticky top-0 z-30 flex h-16 items-center gap-2 border-b px-3 sm:px-4 md:px-6 print:hidden">
          <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open navigation" onClick={() => setMobileOpen(true)}>
            <Menu />
          </Button>

          <div className="flex min-w-0 flex-1 items-center gap-2">
            <ShellBreadcrumbs pathname={pathname} current={current} appLabel={appLabel} />
            {appBadge}
          </div>

          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              className="hidden h-9 w-56 justify-start gap-2 rounded-lg bg-card/70 px-3 font-normal text-muted-foreground shadow-none md:inline-flex xl:w-72"
              onClick={() => setPaletteOpen(true)}
            >
              <Search className="size-4" />
              <span className="flex-1 truncate text-left">{search ? `Search ${search.label.toLowerCase()}, pages…` : "Search pages…"}</span>
              <Kbd>Ctrl K</Kbd>
            </Button>
            <Button variant="ghost" size="icon" className="md:hidden" aria-label="Search" onClick={() => setPaletteOpen(true)}>
              <Search />
            </Button>
            {topbarExtra}
            <ThemeToggle />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="gap-2 px-1.5 sm:px-2" aria-label="Account menu">
                  <Avatar className="size-8">
                    <AvatarFallback>{initials(user.name)}</AvatarFallback>
                  </Avatar>
                  <span className="hidden max-w-40 truncate text-sm font-medium sm:inline">{user.name}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60">
                <DropdownMenuLabel className="font-normal">
                  <div className="truncate text-sm font-medium">{user.name}</div>
                  {user.email && <div className="truncate text-xs text-muted-foreground">{user.email}</div>}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {onThemeSave ? (
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>
                      <Palette /> Theme
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent className="w-56">
                      {APP_THEMES.map((t) => (
                        <DropdownMenuItem
                          key={t.key}
                          onSelect={() => {
                            const before = saved;
                            themeControl.commit(t.key);
                            onThemeSave(t.key).catch(() => themeControl.commit(before));
                          }}
                        >
                          <ThemeDots swatches={t.swatches} />
                          <span className="flex-1">{t.name}</span>
                          {saved === t.key && <Check className="text-primary-strong" />}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                ) : (
                  themeHref && (
                    <DropdownMenuItem asChild>
                      <Link href={themeHref}>
                        <Palette /> App theme
                      </Link>
                    </DropdownMenuItem>
                  )
                )}
                {changePasswordHref && (
                  <DropdownMenuItem asChild>
                    <Link href={changePasswordHref}>
                      <KeyRound /> Change password
                    </Link>
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onSelect={onSignOut}>
                  <LogOut /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <div className="print:hidden">{banner}</div>
        <main
          id="main"
          tabIndex={-1}
          className="mx-auto w-full max-w-7xl flex-1 space-y-6 p-4 pb-[calc(var(--app-bottom-inset,0px)+1.5rem)] outline-none md:p-6 md:pb-[calc(var(--app-bottom-inset,0px)+2rem)] print:max-w-none print:p-0"
        >
          {children}
        </main>
      </div>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-72 gap-0 border-sidebar-border bg-sidebar p-0 text-sidebar-foreground">
          <SheetHeader className="h-16 justify-center border-b border-sidebar-border px-4">
            <SheetTitle asChild>
              <div>
                <BrandBlock brand={brand} />
              </div>
            </SheetTitle>
            <SheetDescription className="sr-only">Menu</SheetDescription>
          </SheetHeader>
          <SidebarNav nav={nav} active={active} onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      {tabItems.length > 1 && (
        <nav
          aria-label="Quick menu"
          className="glass fixed inset-x-0 bottom-0 z-30 border-t pb-[env(safe-area-inset-bottom)] lg:hidden print:hidden"
        >
          <ul className="mx-auto flex h-16 max-w-lg items-stretch justify-around px-2">
            {tabItems.map(({ href, label, short, icon: Icon, badge }) => {
              const on = href === active;
              return (
                <li key={href} className="flex flex-1">
                  <Link
                    href={href}
                    aria-current={on ? "page" : undefined}
                    className={cn(
                      "relative flex flex-1 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl text-[11px] font-medium text-muted-foreground transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                      on && "text-primary-strong",
                    )}
                  >
                    <span className={cn("relative grid h-7 w-12 place-items-center rounded-full transition-colors", on && "bg-accent")}>
                      <Icon className="size-5" />
                      {!!badge && <CountDot count={badge} />}
                    </span>
                    {short ?? label}
                  </Link>
                </li>
              );
            })}
            {hasMore && (
              <li className="flex flex-1">
                <button
                  type="button"
                  onClick={() => setMobileOpen(true)}
                  className="flex flex-1 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl text-[11px] font-medium text-muted-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                  <span className="grid h-7 w-12 place-items-center">
                    <MoreHorizontal className="size-5" />
                  </span>
                  More
                </button>
              </li>
            )}
          </ul>
        </nav>
      )}

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} nav={nav} actions={actions} search={search} />
    </div>
    </AppThemeContext.Provider>
  );
}

function BrandBlock({ brand, compact }: { brand?: ShellBrand; compact?: boolean }) {
  if (!brand) return <Logo size="sm" variant={compact ? "mark" : "full"} />;
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <Avatar className="size-9 rounded-xl bg-white ring-sidebar-border">
        {brand.logoUrl && <AvatarImage src={brand.logoUrl} alt="" className="object-contain p-0.5" />}
        <AvatarFallback className="rounded-xl bg-brand-gradient text-sm font-bold text-primary-foreground">{initials(brand.name)}</AvatarFallback>
      </Avatar>
      {!compact && (
        <span className="min-w-0 leading-tight">
          <span className="block truncate text-sm font-semibold text-sidebar-foreground">{brand.name}</span>
          {brand.caption && <span className="block truncate text-xs text-sidebar-muted-foreground">{brand.caption}</span>}
        </span>
      )}
    </span>
  );
}

function SidebarNav({
  nav,
  active,
  collapsed = false,
  onNavigate,
}: {
  nav: NavItem[];
  active: string | undefined;
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  const groups: { name?: string; items: NavItem[] }[] = [];
  for (const item of nav) {
    const last = groups.at(-1);
    if (last && last.name === item.group) last.items.push(item);
    else groups.push({ name: item.group, items: [item] });
  }

  return (
    <nav className="flex-1 overflow-y-auto p-3">
      {groups.map((g, i) => (
        <Fragment key={g.name ?? `top-${i}`}>
          {g.name &&
            (collapsed ? (
              <div className="mx-auto my-2 h-px w-6 bg-sidebar-border" aria-hidden="true" />
            ) : (
              <p className="mt-4 mb-1 px-3 text-[11px] font-semibold tracking-wider text-sidebar-muted-foreground uppercase">{g.name}</p>
            ))}
          <ul className="space-y-0.5">
            {g.items.map(({ href, label, icon: Icon, badge }) => {
              const on = href === active;
              const link = (
                <Link
                  href={href}
                  onClick={onNavigate}
                  aria-current={on ? "page" : undefined}
                  aria-label={collapsed ? (badge ? `${label} (${badge})` : label) : undefined}
                  className={cn(
                    "group relative flex h-9 items-center gap-3 rounded-lg px-3 text-sm font-medium text-sidebar-foreground transition-colors outline-none hover:bg-sidebar-hover focus-visible:ring-[3px] focus-visible:ring-sidebar-ring/60 pointer-coarse:h-11",
                    collapsed && "justify-center px-0",
                    on && "bg-sidebar-accent text-sidebar-accent-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                  )}
                >
                  {on && <span className="absolute top-1.5 bottom-1.5 left-0 w-1 rounded-r-full bg-sidebar-primary" aria-hidden="true" />}
                  <Icon className={cn("size-[18px] shrink-0", on ? "text-sidebar-accent-foreground" : "text-sidebar-muted-foreground group-hover:text-sidebar-foreground")} />
                  {!collapsed && <span className="flex-1 truncate">{label}</span>}
                  {!!badge &&
                    (collapsed ? (
                      <span className="absolute top-1 right-2 size-2 rounded-full bg-sidebar-primary ring-2 ring-sidebar" aria-hidden="true" />
                    ) : (
                      <span className="rounded-full bg-sidebar-primary px-1.5 py-0.5 text-[11px] leading-none font-semibold text-sidebar-primary-foreground tabular-nums">
                        <span className="sr-only">, </span>
                        {badge > 99 ? "99+" : badge}
                        <span className="sr-only"> need attention</span>
                      </span>
                    ))}
                </Link>
              );
              return (
                <li key={href}>
                  {collapsed ? (
                    <Tooltip>
                      <TooltipTrigger asChild>{link}</TooltipTrigger>
                      <TooltipContent side="right">{badge ? `${label} · ${badge}` : label}</TooltipContent>
                    </Tooltip>
                  ) : (
                    link
                  )}
                </li>
              );
            })}
          </ul>
        </Fragment>
      ))}
    </nav>
  );
}

function ThemeDots({ swatches }: { swatches: readonly string[] }) {
  return (
    <span className="flex -space-x-1" aria-hidden="true">
      {swatches.slice(0, 3).map((c) => (
        <span key={c} className="size-3.5 rounded-full ring-2 ring-popover" style={{ background: c }} />
      ))}
    </span>
  );
}

function CountDot({ count }: { count: number }) {
  return (
    <span className="absolute -top-0.5 right-1.5 min-w-4 rounded-full bg-primary px-1 text-center text-[10px] leading-4 font-bold text-primary-foreground ring-2 ring-background">
      {count > 9 ? "9+" : count}
      <span className="sr-only"> need attention</span>
    </span>
  );
}

const SEGMENT_LABELS: Record<string, string> = {
  new: "New",
  edit: "Edit",
  register: "Register",
  reports: "Reports",
  leave: "Leave",
  collect: "Collect",
  payments: "Payments",
  generate: "Generate charges",
  results: "Results",
  grading: "Grading",
  papers: "Paper",
  lessons: "Lesson plans",
  enquiries: "Enquiries",
  notices: "Notices",
  gallery: "Gallery",
  faculty: "Faculty",
  achievers: "Achievers",
  testimonials: "Testimonials",
  students: "Student",
  batches: "Batch",
};

/** The section (from the menu) and the page under it, e.g. "Fees › Collect" or "Students › Details". */
function ShellBreadcrumbs({ pathname, current, appLabel }: { pathname: string; current: NavItem | undefined; appLabel: string }) {
  if (!current) return <span className="truncate text-sm font-semibold">{appLabel}</span>;
  const rest = pathname === current.href ? [] : pathname.slice(current.href.length + 1).split("/").filter(Boolean);
  const crumbs: { label: string; href: string }[] = [];
  let href = current.href;
  rest.forEach((seg, i) => {
    href += `/${seg}`;
    const isId = /^[0-9a-f-]{8,}$/i.test(seg);
    // An id right after a labelled segment ("papers/<id>") belongs to that segment.
    if (isId && i > 0 && SEGMENT_LABELS[rest[i - 1]!] && crumbs.length) {
      crumbs[crumbs.length - 1]!.href = href;
      return;
    }
    const label = SEGMENT_LABELS[seg] ?? (isId ? "Details" : seg.charAt(0).toUpperCase() + seg.slice(1).replace(/-/g, " "));
    crumbs.push({ label, href });
  });

  return (
    <Breadcrumb className="min-w-0">
      <BreadcrumbList className="flex-nowrap">
        <BreadcrumbItem className={cn("min-w-0", crumbs.length > 0 && "hidden sm:inline-flex")}>
          {crumbs.length ? (
            <BreadcrumbLink asChild>
              <Link href={current.href} className="truncate">
                {current.label}
              </Link>
            </BreadcrumbLink>
          ) : (
            <BreadcrumbPage className="truncate font-semibold">{current.label}</BreadcrumbPage>
          )}
        </BreadcrumbItem>
        {crumbs.map((c, i) => {
          const last = i === crumbs.length - 1;
          return (
            <Fragment key={c.href}>
              <BreadcrumbSeparator className={cn(!last && "hidden sm:block", last && i === 0 && "hidden sm:block")} />
              <BreadcrumbItem className={cn("min-w-0", !last && "hidden sm:inline-flex")}>
                {last ? (
                  <BreadcrumbPage className="truncate font-semibold">{c.label}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink asChild>
                    <Link href={c.href} className="truncate">
                      {c.label}
                    </Link>
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
            </Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}

/** The nav item the current page belongs to: an exact match, else the longest item path the page sits under. */
export function activeHref(pathname: string, nav: NavItem[]): string | undefined {
  return nav
    .filter((n) => pathname === n.href || (!n.exact && pathname.startsWith(`${n.href}/`)))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}
