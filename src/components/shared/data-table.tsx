"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PHONE_QUERY, useMediaQuery } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";
import { EmptyState, ErrorState, LoadingState } from "./states";

export interface Column<T> {
  key: string;
  header: React.ReactNode;
  cell: (row: T) => React.ReactNode;
  className?: string;
  /** Makes the column sortable by clicking its header. Sorts the rows on screen, so use it on lists that are not paged. */
  sortValue?: (row: T) => string | number | null | undefined;
}

export interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}

type Sort = { key: string; dir: "asc" | "desc" } | null;

/**
 * The shared list: a table on wider screens and, when `card` is given, a stack of tappable cards on phones, so
 * no list scrolls sideways on a phone. Only one of the two is rendered. Loading, error and empty states are built in.
 */
export function DataTable<T>({
  columns,
  rows,
  getRowId,
  onRowClick,
  isLoading,
  error,
  onRetry,
  empty,
  pagination,
  card,
  caption,
}: {
  columns: Column<T>[];
  rows: T[] | undefined;
  getRowId: (row: T) => string;
  onRowClick?: (row: T) => void;
  isLoading?: boolean;
  error?: unknown;
  onRetry?: () => void;
  empty?: React.ReactNode;
  pagination?: Pagination;
  /** How one row looks as a card on phones. Without it, phones get the table, scrolling sideways when needed. */
  card?: (row: T) => React.ReactNode;
  /** A short description of the table for screen readers. */
  caption?: string;
}) {
  const phone = useMediaQuery(PHONE_QUERY);
  const [sort, setSort] = useState<Sort>(null);

  const sorted = useMemo(() => {
    const col = sort && columns.find((c) => c.key === sort.key);
    if (!rows || !col?.sortValue) return rows;
    const value = col.sortValue;
    const factor = sort?.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const x = value(a);
      const y = value(b);
      if (x == null || x === "") return 1;
      if (y == null || y === "") return -1;
      if (typeof x === "number" && typeof y === "number") return (x - y) * factor;
      return String(x).localeCompare(String(y), undefined, { numeric: true, sensitivity: "base" }) * factor;
    });
  }, [rows, columns, sort]);

  if (isLoading) return <LoadingState />;
  if (error) {
    return <ErrorState message={error instanceof Error ? error.message : undefined} onRetry={onRetry} />;
  }
  if (!sorted || sorted.length === 0) return <>{empty ?? <EmptyState title="Nothing here yet" />}</>;

  const lastPage = pagination ? Math.max(1, Math.ceil(pagination.total / pagination.pageSize)) : 1;

  const toggleSort = (key: string) =>
    setSort((s) => (s?.key !== key ? { key, dir: "asc" } : s.dir === "asc" ? { key, dir: "desc" } : null));

  return (
    <div className="space-y-3">
      {phone && card ? (
        <ul className="space-y-2.5" aria-label={caption}>
          {sorted.map((row) => (
            <li key={getRowId(row)}>
              {onRowClick ? (
                <button
                  type="button"
                  onClick={() => onRowClick(row)}
                  className="surface-glass-item block w-full cursor-pointer rounded-xl border p-4 text-left transition-all outline-none hover:border-primary/40 hover:shadow-md focus-visible:ring-[3px] focus-visible:ring-ring/50 active:scale-[0.99]"
                >
                  {card(row)}
                </button>
              ) : (
                <div className="surface-glass-item rounded-xl border p-4">{card(row)}</div>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <div className="surface-glass-dense overflow-x-auto rounded-xl border">
          <Table>
            {caption && <caption className="sr-only">{caption}</caption>}
            <TableHeader className="bg-muted/50">
              <TableRow className="hover:bg-transparent">
                {columns.map((c) => {
                  const active = sort?.key === c.key ? sort.dir : null;
                  return (
                    <TableHead
                      key={c.key}
                      className={cn("text-xs font-semibold tracking-wide text-muted-foreground uppercase", c.className)}
                      aria-sort={active === "asc" ? "ascending" : active === "desc" ? "descending" : c.sortValue ? "none" : undefined}
                    >
                      {c.sortValue ? (
                        <button
                          type="button"
                          onClick={() => toggleSort(c.key)}
                          className="-mx-1 inline-flex cursor-pointer items-center gap-1 rounded px-1 uppercase outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
                        >
                          {c.header}
                          {active === "asc" ? (
                            <ArrowUp className="size-3.5" aria-hidden="true" />
                          ) : active === "desc" ? (
                            <ArrowDown className="size-3.5" aria-hidden="true" />
                          ) : (
                            <ChevronsUpDown className="size-3.5 opacity-50" aria-hidden="true" />
                          )}
                        </button>
                      ) : (
                        c.header
                      )}
                    </TableHead>
                  );
                })}
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((row) => (
                <TableRow
                  key={getRowId(row)}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={cn(onRowClick && "cursor-pointer")}
                >
                  {columns.map((c) => (
                    <TableCell key={c.key} className={c.className}>
                      {c.cell(row)}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {pagination && pagination.total > pagination.pageSize && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
          <span className="tabular-nums">
            Page {pagination.page} of {lastPage} · {pagination.total} total
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              aria-label="Previous page"
              disabled={pagination.page <= 1}
              onClick={() => pagination.onPageChange(pagination.page - 1)}
            >
              <ChevronLeft /> Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              aria-label="Next page"
              disabled={pagination.page >= lastPage}
              onClick={() => pagination.onPageChange(pagination.page + 1)}
            >
              Next <ChevronRight />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/** The plan's name for the shared list: the same component, used with a `card` for phones. */
export const ResponsiveList = DataTable;
