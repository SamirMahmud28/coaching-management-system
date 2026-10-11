"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { AuditLogTable } from "@/components/shared/audit-log-table";
import { FilterBar } from "@/components/shared/filter-bar";
import { PageHeader } from "@/components/shared/page-header";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { humanizeAction } from "@/lib/format";
import { platformApi, type AuditRow } from "../api";
import { platformKeys } from "../keys";

const PAGE_SIZE = 25;

const ACTIONS = [
  "TENANT_CREATED",
  "TENANT_SUSPENDED",
  "TENANT_REACTIVATED",
  "TENANT_DEACTIVATED",
  "TENANT_OWNERSHIP_TRANSFERRED",
  "TENANT_PAID_UNTIL_CHANGED",
  "MODULE_ENTITLEMENT_CHANGED",
  "MODULE_REQUEST_DISMISSED",
  "PLATFORM_ADMIN_CREATED",
  "PLATFORM_ADMIN_DISABLED",
  "PLATFORM_ADMIN_ENABLED",
];

export function AuditLogPage() {
  const [actorType, setActorType] = useState<AuditRow["actor_type"] | "ALL">("ALL");
  const [action, setAction] = useState<string>("ALL");
  const [tenantId, setTenantId] = useState("");
  const [page, setPage] = useState(1);

  const validTenantId = /^[0-9a-f-]{36}$/i.test(tenantId.trim()) ? tenantId.trim() : undefined;
  const params = {
    actor_type: actorType === "ALL" ? undefined : actorType,
    action: action === "ALL" ? undefined : action,
    tenant_id: validTenantId,
    page,
    page_size: PAGE_SIZE,
  };
  const query = useQuery({ queryKey: platformKeys.audit(params), queryFn: () => platformApi.auditLog(params), placeholderData: keepPreviousData });
  const filtered = actorType !== "ALL" || action !== "ALL" || !!tenantId;

  return (
    <>
      <PageHeader title="Audit log" description="Every consequential action, across every institute and the platform itself." />
      <FilterBar
        canClear={filtered}
        onClear={() => {
          setActorType("ALL");
          setAction("ALL");
          setTenantId("");
          setPage(1);
        }}
      >
        <Select
          value={actorType}
          onValueChange={(v) => {
            setActorType(v as typeof actorType);
            setPage(1);
          }}
        >
          <SelectTrigger className="sm:w-44" aria-label="Filter by actor type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All actors</SelectItem>
            <SelectItem value="PLATFORM_USER">Platform admin</SelectItem>
            <SelectItem value="TENANT_USER">Institute user</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={action}
          onValueChange={(v) => {
            setAction(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="sm:w-64" aria-label="Filter by action">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All actions</SelectItem>
            {ACTIONS.map((a) => (
              <SelectItem key={a} value={a}>
                {humanizeAction(a)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          className="font-mono sm:w-80"
          placeholder="Institute id (optional)"
          value={tenantId}
          onChange={(e) => {
            setTenantId(e.target.value);
            setPage(1);
          }}
          aria-label="Filter by institute id"
        />
      </FilterBar>

      <AuditLogTable
        items={query.data?.items}
        total={query.data?.total ?? 0}
        page={page}
        pageSize={PAGE_SIZE}
        onPageChange={setPage}
        isLoading={query.isPending}
        error={query.error}
        onRetry={() => query.refetch()}
        showInstituteColumn
        emptyMessage={filtered ? "No entries match these filters." : "Nothing has been logged yet."}
      />
    </>
  );
}
