"use client";

import { ChevronDown, ChevronRight } from "lucide-react";
import { Fragment, useState } from "react";
import { formatDateTime, humanizeAction } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState, ErrorState, LoadingState } from "./states";

export interface AuditLogRow {
  id: string;
  tenant_id: string | null;
  tenant_name: string | null;
  actor_type: "TENANT_USER" | "PLATFORM_USER";
  actor_name: string | null;
  resource_type: string;
  resource_id: string | null;
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  action: string;
  timestamp: string;
}

/** Not DataTable: rows expand to show before/after values. Shared by the platform and institute audit logs. */
export function AuditLogTable({
  items,
  total,
  page,
  pageSize,
  onPageChange,
  isLoading,
  error,
  onRetry,
  showInstituteColumn = false,
  emptyMessage = "Nothing has been logged yet.",
}: {
  items: AuditLogRow[] | undefined;
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  isLoading?: boolean;
  error?: unknown;
  onRetry?: () => void;
  showInstituteColumn?: boolean;
  emptyMessage?: string;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const lastPage = Math.max(1, Math.ceil(total / pageSize));

  if (isLoading) return <LoadingState />;
  if (error) return <ErrorState message={error instanceof Error ? error.message : undefined} onRetry={onRetry} />;
  if (!items || items.length === 0) return <EmptyState title={emptyMessage} />;

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8" />
              <TableHead>When</TableHead>
              <TableHead>Actor</TableHead>
              {showInstituteColumn && <TableHead>Institute</TableHead>}
              <TableHead>Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((row) => {
              const open = expanded === row.id;
              return (
                <Fragment key={row.id}>
                  <TableRow className="cursor-pointer" onClick={() => setExpanded(open ? null : row.id)} aria-expanded={open}>
                    <TableCell>{open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}</TableCell>
                    <TableCell className="whitespace-nowrap">{formatDateTime(row.timestamp)}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-2">
                        {row.actor_name ?? "—"}
                        <Badge variant="outline">{row.actor_type === "PLATFORM_USER" ? "Platform" : "Institute"}</Badge>
                      </div>
                    </TableCell>
                    {showInstituteColumn && (
                      <TableCell>{row.tenant_name ?? <span className="text-muted-foreground">Platform</span>}</TableCell>
                    )}
                    <TableCell>{humanizeAction(row.action)}</TableCell>
                  </TableRow>
                  {open && (
                    <TableRow className="hover:bg-transparent">
                      <TableCell />
                      <TableCell colSpan={showInstituteColumn ? 4 : 3}>
                        <AuditDetail row={row} showTenantId={showInstituteColumn} />
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </div>
      {total > pageSize && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Page {page} of {lastPage} · {total} total
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
              Previous
            </Button>
            <Button variant="outline" size="sm" disabled={page >= lastPage} onClick={() => onPageChange(page + 1)}>
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function AuditDetail({ row, showTenantId }: { row: AuditLogRow; showTenantId: boolean }) {
  return (
    <div className="grid gap-3 py-1 text-xs sm:grid-cols-2">
      <div className="space-y-1">
        <p className="font-medium text-muted-foreground">Resource</p>
        <p className="font-mono break-all">
          {row.resource_type}
          {row.resource_id && ` · ${row.resource_id}`}
        </p>
        {showTenantId && row.tenant_id && <p className="font-mono break-all text-muted-foreground">tenant · {row.tenant_id}</p>}
      </div>
      {(["old_value", "new_value"] as const).map((k) =>
        row[k] ? (
          <div key={k} className="space-y-1">
            <p className="font-medium text-muted-foreground">{k === "old_value" ? "Before" : "After"}</p>
            <pre className="overflow-x-auto rounded-md bg-muted p-2 font-mono">{JSON.stringify(row[k], null, 2)}</pre>
          </div>
        ) : null,
      )}
    </div>
  );
}
