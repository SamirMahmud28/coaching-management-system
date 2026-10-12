"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { AuditLogTable } from "@/components/shared/audit-log-table";
import { PageHeader } from "@/components/shared/page-header";
import { instituteApi } from "../api";
import { instituteKeys } from "../keys";
import { HowThisWorks } from "@/modules/institute/help/how-this-works";

const PAGE_SIZE = 25;

export function InstituteAuditLogPage() {
  const [page, setPage] = useState(1);
  const params = { page, page_size: PAGE_SIZE };
  const query = useQuery({ queryKey: instituteKeys.audit(params), queryFn: () => instituteApi.auditLog(params), placeholderData: keepPreviousData });

  return (
    <>
      <PageHeader title="Audit log" description="Actions taken on your institute's account, including by Neo Nexor." />
      <HowThisWorks topic="audit-log" />
      <AuditLogTable
        items={query.data?.items}
        total={query.data?.total ?? 0}
        page={page}
        pageSize={PAGE_SIZE}
        onPageChange={setPage}
        isLoading={query.isPending}
        error={query.error}
        onRetry={() => query.refetch()}
      />
    </>
  );
}
