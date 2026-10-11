"use client";

import { useQuery } from "@tanstack/react-query";
import { CheckCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { DataTable, type Column } from "@/components/shared/data-table";
import { FilterBar } from "@/components/shared/filter-bar";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/states";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { platformApi, type ModuleRequestRow } from "../api";
import { formatDate } from "@/lib/format";
import { platformKeys } from "../keys";
import { DismissRequestDialog } from "./dismiss-request-dialog";

export function ModuleRequestsPage() {
  const router = useRouter();
  const [status, setStatus] = useState<ModuleRequestRow["status"]>("PENDING");
  const [tenantSearch, setTenantSearch] = useState("");
  const [dismissing, setDismissing] = useState<ModuleRequestRow | null>(null);
  const params = { status };
  const query = useQuery({ queryKey: platformKeys.moduleRequests(params), queryFn: () => platformApi.listModuleRequests(params) });

  // The queue is small; tenant search filters what's already loaded.
  const term = tenantSearch.trim().toLowerCase();
  const rows = query.data?.items.filter((r) => !term || r.tenant_name.toLowerCase().includes(term) || r.tenant_subdomain.includes(term));

  const columns: Column<ModuleRequestRow>[] = [
    {
      key: "tenant",
      header: "Institute",
      cell: (r) => (
        <div>
          <div className="font-medium">{r.tenant_name}</div>
          <div className="font-mono text-xs text-muted-foreground">{r.tenant_subdomain}</div>
        </div>
      ),
    },
    { key: "module", header: "Module", cell: (r) => r.module_name },
    { key: "by", header: "Requested by", cell: (r) => r.requested_by_name ?? "—", className: "hidden lg:table-cell" },
    { key: "note", header: "Note", cell: (r) => <span className="line-clamp-2 text-muted-foreground">{r.note ?? "—"}</span>, className: "hidden md:table-cell" },
    { key: "date", header: "Requested", cell: (r) => formatDate(r.created_at), className: "hidden sm:table-cell" },
    {
      key: "actions",
      header: <span className="sr-only">Actions</span>,
      cell: (r) =>
        r.status === "PENDING" ? (
          <div className="flex justify-end gap-2">
            {/* Enabling the module marks the request fulfilled. */}
            <Button size="sm" onClick={() => router.push(`/institutes/${r.tenant_id}`)}>
              Fulfill
            </Button>
            <Button size="sm" variant="outline" onClick={() => setDismissing(r)}>
              Dismiss
            </Button>
          </div>
        ) : (
          <StatusBadge status={r.status} />
        ),
    },
  ];

  return (
    <>
      <PageHeader title="Module requests" description="Requests from institutes to enable a module." />
      <FilterBar
        canClear={status !== "PENDING" || !!term}
        onClear={() => {
          setStatus("PENDING");
          setTenantSearch("");
        }}
      >
        <Select value={status} onValueChange={(v) => setStatus(v as ModuleRequestRow["status"])}>
          <SelectTrigger className="sm:w-44" aria-label="Filter by status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="PENDING">Pending</SelectItem>
            <SelectItem value="FULFILLED">Fulfilled</SelectItem>
            <SelectItem value="DISMISSED">Dismissed</SelectItem>
          </SelectContent>
        </Select>
        <Input className="sm:w-64" placeholder="Search institute" value={tenantSearch} onChange={(e) => setTenantSearch(e.target.value)} aria-label="Search institute" />
      </FilterBar>
      <DataTable
        columns={columns}
        rows={rows}
        getRowId={(r) => r.id}
        isLoading={query.isPending}
        error={query.error}
        onRetry={() => query.refetch()}
        empty={
          status === "PENDING" && !term ? (
            <EmptyState icon={CheckCheck} title="All caught up — no pending module requests." />
          ) : (
            <EmptyState title="No requests match these filters." />
          )
        }
      />
      <DismissRequestDialog request={dismissing} onClose={() => setDismissing(null)} />
    </>
  );
}
