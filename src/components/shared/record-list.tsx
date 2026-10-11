"use client";

/* eslint-disable @next/next/no-img-element -- photos are authenticated, tenant-scoped files; the optimizer would bypass the session check */
import { MoreHorizontal, RotateCcw, Search } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { ErrorState, LoadingState } from "./states";

/**
 * The record-list layout used by the Students, Teachers and Staff pages: a titled header with a breadcrumb, a filter
 * card applied with Search, and a ruled table card with entries-per-page, search, numbered pagination and row actions.
 */

const BORDER = "border-[#d6c7a1]";

export function ListPageHeader({ title, crumb, action }: { title: string; crumb: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <nav aria-label="Breadcrumb" className="mt-0.5 text-sm text-muted-foreground">
          <Link href="/" className="hover:text-foreground">
            Home
          </Link>
          <span aria-hidden className="mx-1.5">
            -
          </span>
          <span className="text-primary-strong">{crumb}</span>
        </nav>
      </div>
      {action}
    </div>
  );
}

export interface FilterField {
  key: string;
  label: string;
  options: { value: string; label: string }[];
  placeholder: string;
  disabled?: boolean;
}

/**
 * Filter selects applied together with Search, as in a paper register: `draft` holds what is chosen, `onSearch` applies
 * it. Every select keeps the "Filter by …" name the page always had.
 */
export function FilterCard({
  fields,
  draft,
  onDraftChange,
  onSearch,
  onReset,
  canReset,
}: {
  fields: FilterField[];
  draft: Record<string, string>;
  onDraftChange: (key: string, value: string) => void;
  onSearch: () => void;
  onReset: () => void;
  canReset: boolean;
}) {
  const select = (f: FilterField) => (
    <div key={f.key} className="space-y-1.5">
      <label className="text-sm font-medium" htmlFor={`filter-${f.key}`}>
        {f.label}
      </label>
      <Select value={draft[f.key] || undefined} onValueChange={(v) => onDraftChange(f.key, v)} disabled={f.disabled}>
        <SelectTrigger id={`filter-${f.key}`} aria-label={`Filter by ${f.label.toLowerCase()}`} className="w-full bg-muted/40">
          <SelectValue placeholder={f.placeholder} />
        </SelectTrigger>
        <SelectContent>
          {f.options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <section aria-label="Filters" className="rounded-xl border bg-card p-4 shadow-xs sm:p-5">
      <form
        className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-[repeat(auto-fit,minmax(12rem,1fr))]"
        onSubmit={(e) => {
          e.preventDefault();
          onSearch();
        }}
      >
        {fields.map(select)}
        <div className="flex flex-wrap gap-2 sm:col-span-2 lg:col-span-1">
          <Button type="submit" className="px-6">
            <Search aria-hidden /> Search
          </Button>
          {canReset && (
            <Button type="button" variant="ghost" onClick={onReset}>
              <RotateCcw aria-hidden /> Reset
            </Button>
          )}
        </div>
      </form>
    </section>
  );
}

export interface RecordColumn<T> {
  key: string;
  header: string;
  cell: (row: T, index: number) => React.ReactNode;
  className?: string;
}

const PAGE_SIZES = [10, 25, 50, 100];

/** The page numbers shown around the current page, at most `span` of them. */
export function pageWindow(page: number, lastPage: number, span = 5): number[] {
  const start = Math.max(1, Math.min(page - Math.floor(span / 2), lastPage - span + 1));
  return Array.from({ length: Math.min(span, lastPage) }, (_, i) => start + i);
}

export function RecordTable<T>({
  label,
  columns,
  rows,
  getRowId,
  isLoading,
  error,
  onRetry,
  empty,
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  search,
}: {
  label: string;
  columns: RecordColumn<T>[];
  rows: T[] | undefined;
  getRowId: (row: T) => string;
  isLoading?: boolean;
  error?: unknown;
  onRetry?: () => void;
  empty: React.ReactNode;
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  search: { value: string; onChange: (value: string) => void; placeholder: string };
}) {
  const lastPage = Math.max(1, Math.ceil(total / pageSize));
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(total, page * pageSize);
  const pager = (text: string, target: number, disabled: boolean) => (
    <Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={() => onPageChange(target)} aria-label={`${text} page`}>
      {text}
    </Button>
  );

  return (
    <section aria-label={label} className={cn("space-y-4 rounded-xl border bg-card p-4 shadow-xs sm:p-5", BORDER)}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm">
          Show
          <Select value={String(pageSize)} onValueChange={(v) => onPageSizeChange(Number(v))}>
            <SelectTrigger className="w-20" aria-label="Entries per page">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZES.map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          Entries
        </label>
        <label className="flex w-full items-center gap-2 text-sm sm:w-auto">
          Search
          <Input type="search" value={search.value} onChange={(e) => search.onChange(e.target.value)} placeholder={search.placeholder} className="sm:w-64" />
        </label>
      </div>

      {isLoading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error instanceof Error ? error.message : undefined} onRetry={onRetry} />
      ) : !rows || rows.length === 0 ? (
        empty
      ) : (
        <TooltipProvider>
          <div className={cn("overflow-x-auto border", BORDER)}>
            <table className="w-full min-w-[58rem] border-collapse text-sm">
              <thead>
                <tr>
                  {columns.map((c) => (
                    <th
                      key={c.key}
                      scope="col"
                      className={cn("border-r border-b bg-[#f7f1e6] px-2.5 py-3 text-left text-[0.7rem] font-bold tracking-wide text-[#3f3423] uppercase last:border-r-0 dark:bg-muted dark:text-foreground", BORDER, c.className)}
                    >
                      {c.header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={getRowId(row)} className="hover:bg-muted/40">
                    {columns.map((c) => (
                      <td key={c.key} className={cn("border-r border-b px-2.5 py-2.5 align-middle last:border-r-0", BORDER, c.className)}>
                        {c.cell(row, (page - 1) * pageSize + i + 1)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TooltipProvider>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <p aria-live="polite">
          Showing {first} To {last} Of {total} Entries
        </p>
        {lastPage > 1 && (
          <nav aria-label="Pagination" className="flex flex-wrap items-center gap-1">
            {pager("First", 1, page <= 1)}
            {pager("Previous", page - 1, page <= 1)}
            {pageWindow(page, lastPage).map((n) => (
              <Button key={n} type="button" size="sm" variant={n === page ? "default" : "ghost"} aria-current={n === page ? "page" : undefined} aria-label={`Page ${n}`} onClick={() => onPageChange(n)}>
                {n}
              </Button>
            ))}
            {pager("Next", page + 1, page >= lastPage)}
            {pager("Last", lastPage, page >= lastPage)}
          </nav>
        )}
      </div>
    </section>
  );
}

/** A square, framed photo, or a "No photo" frame. */
export function RecordPhoto({ fileId, name }: { fileId: string | null; name: string }) {
  const frame = cn("size-12 shrink-0 rounded-md border bg-muted", BORDER);
  return fileId ? (
    <img src={`/api/v1/files/${fileId}`} alt={`Photo of ${name}`} className={cn(frame, "object-cover")} />
  ) : (
    <span aria-hidden className={cn(frame, "flex items-center justify-center text-center text-[0.6rem] leading-tight text-muted-foreground")}>
      No photo
    </span>
  );
}

export interface RowAction {
  label: string;
  /** The accessible name; defaults to "{label} {name}". */
  ariaLabel?: string;
  icon: React.ComponentType<{ className?: string }>;
  /** A link (`href`, optionally in a new tab) or a click handler. */
  href?: string;
  newTab?: boolean;
  onSelect?: () => void;
  destructive?: boolean;
}

/** Square icon buttons with tooltips, then a ⋯ menu ("Actions for {name}") for the rest, if any. */
export function ActionIcons({ name, actions, menu }: { name: string; actions: RowAction[]; menu: { label: string; onSelect: () => void }[] }) {
  return (
    <div className="flex items-center gap-1">
      {actions.map((a) => {
        const Icon = a.icon;
        const className = cn("size-8 bg-muted/60", a.destructive && "text-destructive hover:text-destructive");
        const aria = a.ariaLabel ?? `${a.label} ${name}`;
        return (
          <Tooltip key={a.label}>
            <TooltipTrigger asChild>
              {a.href ? (
                <Button variant="ghost" size="icon" asChild className={className}>
                  {a.newTab ? (
                    <a href={a.href} aria-label={aria} target="_blank" rel="noopener">
                      <Icon className="size-4" />
                    </a>
                  ) : (
                    <Link href={a.href} aria-label={aria}>
                      <Icon className="size-4" />
                    </Link>
                  )}
                </Button>
              ) : (
                <Button variant="ghost" size="icon" className={className} aria-label={aria} onClick={a.onSelect}>
                  <Icon className="size-4" />
                </Button>
              )}
            </TooltipTrigger>
            <TooltipContent>{a.label}</TooltipContent>
          </Tooltip>
        );
      })}
      {menu.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="size-8 bg-muted/60" aria-label={`Actions for ${name}`}>
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {menu.map((m) => (
              <DropdownMenuItem key={m.label} onSelect={m.onSelect}>
                {m.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
