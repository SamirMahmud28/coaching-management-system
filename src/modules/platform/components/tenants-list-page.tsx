"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Building2, ChevronRight, Plus, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { DataTable, type Column } from "@/components/shared/data-table";
import { FilterBar } from "@/components/shared/filter-bar";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/states";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { platformApi, type TenantListItem, type TenantStatus } from "../api";
import { formatDate } from "@/lib/format";
import { platformKeys } from "../keys";
import { NewTenantWizard } from "./new-tenant-wizard";

const PAGE_SIZE = 20;

export function TenantsListPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<TenantStatus | "ALL">("ALL");
  const [page, setPage] = useState(1);
  const [wizardOpen, setWizardOpen] = useState(false);
  // Remount the wizard on each open for a clean state.
  const [wizardKey, setWizardKey] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      setQ(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const params = { q: q || undefined, status: status === "ALL" ? undefined : status, page, page_size: PAGE_SIZE };
  const query = useQuery({
    queryKey: platformKeys.tenants(params),
    queryFn: () => platformApi.listTenants(params),
    placeholderData: keepPreviousData,
  });
  const filtered = !!q || status !== "ALL";

  const columns: Column<TenantListItem>[] = [
    {
      key: "institute",
      header: "Institute",
      cell: (t) => (
        <div className="min-w-0">
          <div className="font-medium">{t.name}</div>
          <div className="font-mono text-xs text-muted-foreground">{t.subdomain}</div>
        </div>
      ),
    },
    { key: "status", header: "Status", cell: (t) => <StatusBadge status={t.status} /> },
    { key: "modules", header: "Modules", cell: (t) => t.module_count, className: "text-right w-24" },
    { key: "created", header: "Created", cell: (t) => formatDate(t.created_at), className: "hidden sm:table-cell" },
    {
      key: "actions",
      header: <span className="sr-only">Actions</span>,
      className: "w-12",
      cell: (t) => (
        <Button variant="ghost" size="icon-sm" aria-label={`View ${t.name}`} onClick={() => router.push(`/institutes/${t.id}`)}>
          <ChevronRight />
        </Button>
      ),
    },
  ];

  const newTenant = (
    <Button
      variant="gradient"
      onClick={() => {
        setWizardKey((k) => k + 1);
        setWizardOpen(true);
      }}
    >
      <Plus /> New institute
    </Button>
  );

  return (
    <>
      <PageHeader title="Institutes" description="Manage institute accounts on the platform." actions={newTenant} />

      <FilterBar
        canClear={filtered}
        onClear={() => {
          setSearch("");
          setQ("");
          setStatus("ALL");
          setPage(1);
        }}
      >
        <div className="relative sm:w-72">
          <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search name or subdomain" className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search tenants" />
        </div>
        <Select
          value={status}
          onValueChange={(v) => {
            setStatus(v as TenantStatus | "ALL");
            setPage(1);
          }}
        >
          <SelectTrigger className="sm:w-44" aria-label="Filter by status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All statuses</SelectItem>
            <SelectItem value="ACTIVE">Active</SelectItem>
            <SelectItem value="SUSPENDED">Suspended</SelectItem>
            <SelectItem value="DEACTIVATED">Deactivated</SelectItem>
            <SelectItem value="PENDING">Pending</SelectItem>
          </SelectContent>
        </Select>
      </FilterBar>

      <DataTable
        columns={columns}
        rows={query.data?.items}
        getRowId={(t) => t.id}
        onRowClick={(t) => router.push(`/institutes/${t.id}`)}
        isLoading={query.isPending}
        error={query.error}
        onRetry={() => query.refetch()}
        pagination={query.data ? { page, pageSize: PAGE_SIZE, total: query.data.total, onPageChange: setPage } : undefined}
        empty={
          filtered ? (
            <EmptyState title="No tenants match these filters" icon={Search} />
          ) : (
            <EmptyState title="No institutes yet" description="Create the first institute account to get started." icon={Building2} action={newTenant} />
          )
        }
      />

      <NewTenantWizard key={wizardKey} open={wizardOpen} onOpenChange={setWizardOpen} />
    </>
  );
}
