"use client";

import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandShortcut } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import type { NavItem } from "./app-shell";

export interface PaletteAction {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  keywords?: string;
}

export interface PaletteResult {
  id: string;
  href: string;
  title: string;
  subtitle?: string;
}

export interface PaletteSearch {
  /** Group heading for the results, e.g. "Students". */
  label: string;
  placeholder: string;
  /** Server search; only results the user may see come back (the API enforces it). */
  run: (query: string, signal: AbortSignal) => Promise<PaletteResult[]>;
}

const matches = (q: string, ...texts: (string | undefined)[]) => texts.some((t) => t?.toLowerCase().includes(q));

/**
 * The ⌘K / Ctrl+K palette (D152): jump to any page in the menu, start a common task, or find a record by name, ID or
 * mobile. Everything listed comes from what the user can already open, so it reveals nothing new.
 */
export function CommandPalette({
  open,
  onOpenChange,
  nav,
  actions = [],
  search,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nav: NavItem[];
  actions?: PaletteAction[];
  search?: PaletteSearch;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ query: string; items: PaletteResult[] } | null>(null);
  const q = query.trim().toLowerCase();
  const searching = !!search && q.length >= 2;
  // Callers may pass a new search object on every render; only the query should restart a search.
  const searchRef = useRef(search);
  useEffect(() => {
    searchRef.current = search;
  });

  useEffect(() => {
    const current = searchRef.current;
    if (!searching || !current) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      current
        .run(query.trim(), controller.signal)
        .then((items) => setResults({ query: q, items }))
        .catch(() => {
          if (!controller.signal.aborted) setResults({ query: q, items: [] });
        });
    }, 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [searching, query, q]);

  const pages = useMemo(() => nav.filter((n) => !q || matches(q, n.label, n.group)), [nav, q]);
  const tasks = useMemo(() => actions.filter((a) => !q || matches(q, a.label, a.keywords)), [actions, q]);
  const found = searching && results?.query === q ? results.items : [];
  const loading = searching && results?.query !== q;

  function go(href: string) {
    onOpenChange(false);
    setQuery("");
    router.push(href);
  }

  return (
    <CommandDialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) setQuery("");
      }}
      title="Search"
      shouldFilter={false}
      description="Find a page, start a task or look someone up"
    >
      <CommandInput value={query} onValueChange={setQuery} placeholder={search?.placeholder ?? "Search pages and actions…"} />
      <CommandList>
        {!loading && <CommandEmpty>Nothing found for “{query}”.</CommandEmpty>}
        {search && searching && (found.length > 0 || loading) && (
          <CommandGroup heading={search.label}>
            {loading && found.length === 0 ? (
              <div className="px-2 py-3 text-sm text-muted-foreground">Searching…</div>
            ) : (
              found.map((r) => (
                <CommandItem key={r.id} value={`result-${r.id}`} onSelect={() => go(r.href)}>
                  <Search />
                  <span className="min-w-0 flex-1 truncate">
                    {r.title}
                    {r.subtitle && <span className="ml-2 text-xs text-muted-foreground">{r.subtitle}</span>}
                  </span>
                </CommandItem>
              ))
            )}
          </CommandGroup>
        )}
        {tasks.length > 0 && (
          <CommandGroup heading="Quick actions">
            {tasks.map(({ href, label, icon: Icon }) => (
              <CommandItem key={href} value={`action-${href}`} onSelect={() => go(href)}>
                <Icon />
                {label}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {pages.length > 0 && (
          <CommandGroup heading="Go to">
            {pages.map(({ href, label, icon: Icon, group }) => (
              <CommandItem key={href} value={`page-${href}`} onSelect={() => go(href)}>
                <Icon />
                {label}
                {group && <CommandShortcut className="tracking-normal">{group}</CommandShortcut>}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
      <div className={cn("flex items-center gap-3 border-t px-4 py-2 text-xs text-muted-foreground")}>
        <span>
          <Kbd>↑</Kbd> <Kbd>↓</Kbd> to move
        </span>
        <span>
          <Kbd>Enter</Kbd> to open
        </span>
        <span className="ml-auto">
          <Kbd>Esc</Kbd> to close
        </span>
      </div>
    </CommandDialog>
  );
}

export function Kbd({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <kbd className={cn("inline-flex h-5 min-w-5 items-center justify-center rounded border bg-muted px-1 font-sans text-[11px] font-medium text-muted-foreground", className)}>
      {children}
    </kbd>
  );
}
