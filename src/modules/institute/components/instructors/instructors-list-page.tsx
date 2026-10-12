"use client";

import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { GraduationCap, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { DataTable, type Column } from "@/components/shared/data-table";
import { OneTimePasswordDialog } from "@/components/shared/one-time-password-dialog";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/states";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { instructorsApi, type InstructorRow, type InstructorStatus } from "../../api";
import { instituteKeys } from "../../keys";
import { InstructorFormDialog } from "./instructor-form-dialog";

const PAGE_SIZE = 25;

export function InstructorsListPage({ canManage }: { canManage: boolean }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<InstructorStatus | "ALL">("ACTIVE");
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [oneTime, setOneTime] = useState<{ name: string; password: string } | null>(null);
  const q = useDebouncedValue(search.trim(), 300);
  const params = { q: q || undefined, status: status === "ALL" ? undefined : status, page, page_size: PAGE_SIZE };
  const query = useQuery({ queryKey: instituteKeys.instructors(params), queryFn: () => instructorsApi.list(params), placeholderData: keepPreviousData });

  const columns: Column<InstructorRow>[] = [
    { key: "name", header: "Name", cell: (i) => <span className="font-medium">{i.full_name}</span> },
    { key: "phone", header: "Mobile", cell: (i) => <span className="font-mono text-sm">{i.phone ?? "—"}</span> },
    { key: "email", header: "Email", cell: (i) => i.email ?? "—", className: "hidden md:table-cell" },
    { key: "status", header: "Status", cell: (i) => <StatusBadge status={i.status} /> },
  ];

  const add = canManage ? (
    <Button onClick={() => setCreating(true)}>
      <Plus /> New instructor
    </Button>
  ) : null;

  return (
    <>
      <PageHeader title="Instructors" description="Everyone who teaches at your institute. Each instructor signs in to the instructor portal." actions={add} />
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          className="sm:w-72"
          placeholder="Search name, mobile or email"
          aria-label="Search instructors"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
        <Select
          value={status}
          onValueChange={(v) => {
            setStatus(v as InstructorStatus | "ALL");
            setPage(1);
          }}
        >
          <SelectTrigger className="sm:w-40" aria-label="Filter by status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ACTIVE">Active</SelectItem>
            <SelectItem value="INACTIVE">Inactive</SelectItem>
            <SelectItem value="ALL">All</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <DataTable
        columns={columns}
        rows={query.data?.items}
        getRowId={(i) => i.id}
        onRowClick={(i) => router.push(`/app/instructors/${i.id}`)}
        isLoading={query.isPending}
        error={query.error}
        onRetry={() => query.refetch()}
        pagination={query.data ? { page, pageSize: PAGE_SIZE, total: query.data.total, onPageChange: setPage } : undefined}
        empty={<EmptyState icon={GraduationCap} title={q || status !== "ACTIVE" ? "No instructors match." : "No instructors yet"} action={q ? undefined : add} />}
      />

      <InstructorFormDialog
        open={creating}
        onOpenChange={setCreating}
        onSubmit={async (fields, temporaryPassword) => {
          const created = await instructorsApi.create({ ...fields, temporary_password: temporaryPassword! });
          await queryClient.invalidateQueries({ queryKey: ["institute-instructors"] });
          setOneTime({ name: created.instructor.full_name, password: created.temporary_password });
        }}
      />
      <OneTimePasswordDialog value={oneTime} onClose={() => setOneTime(null)} />
    </>
  );
}
