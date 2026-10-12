"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Plus, UserRound } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { DataTable, type Column } from "@/components/shared/data-table";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/states";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { academicApi, studentsApi, type StudentListRow, type StudentStatus } from "../../api";
import { instituteKeys } from "../../keys";

const PAGE_SIZE = 25;
const ANY = "any";
const NO_BATCH = "none";

export function StudentsListPage({ canAdmit, canSeeContacts, canSeeBatches }: { canAdmit: boolean; canSeeContacts: boolean; canSeeBatches: boolean }) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StudentStatus | "ALL">("ACTIVE");
  const [batch, setBatch] = useState(ANY);
  const [page, setPage] = useState(1);
  const q = useDebouncedValue(search.trim(), 300);
  const params = {
    q: q || undefined,
    status,
    batch_id: batch === ANY || batch === NO_BATCH ? undefined : batch,
    no_batch: batch === NO_BATCH ? ("true" as const) : undefined,
    page,
    page_size: PAGE_SIZE,
  };
  const query = useQuery({ queryKey: instituteKeys.students(params), queryFn: () => studentsApi.list(params), placeholderData: keepPreviousData });
  const batches = useQuery({ queryKey: instituteKeys.batches({ status: "ACTIVE" }), queryFn: () => academicApi.batches({ status: "ACTIVE" }), enabled: canSeeBatches });

  const columns: Column<StudentListRow>[] = [
    { key: "id", header: "ID", cell: (s) => <span className="font-mono text-sm">{s.student_code}</span> },
    { key: "name", header: "Name", cell: (s) => <span className="font-medium">{s.full_name}</span> },
    {
      key: "batches",
      header: "Batches",
      cell: (s) => (s.batches.length ? s.batches.map((b) => b.name).join(", ") : <span className="text-muted-foreground">No batch</span>),
      className: "hidden md:table-cell",
    },
    ...(canSeeContacts
      ? [{ key: "guardian", header: "Guardian's mobile", cell: (s: StudentListRow) => <span className="font-mono text-sm">{s.guardian_phone}</span>, className: "hidden lg:table-cell" }]
      : []),
    { key: "status", header: "Status", cell: (s) => <StatusBadge status={s.status} /> },
  ];

  const add = canAdmit ? (
    <Button asChild>
      <Link href="/app/students/new">
        <Plus /> Admit student
      </Link>
    </Button>
  ) : null;
  const filtered = !!q || status !== "ACTIVE" || batch !== ANY;

  return (
    <>
      <PageHeader title="Students" description="Everyone admitted to your institute. Students sign in with their student ID." actions={add} />
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          className="sm:w-72"
          placeholder={canSeeContacts ? "Search name, ID or mobile" : "Search name or ID"}
          aria-label="Search students"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
        <Select
          value={status}
          onValueChange={(v) => {
            setStatus(v as StudentStatus | "ALL");
            setPage(1);
          }}
        >
          <SelectTrigger className="sm:w-40" aria-label="Filter by status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ACTIVE">Active</SelectItem>
            <SelectItem value="ON_HOLD">On hold</SelectItem>
            <SelectItem value="COMPLETED">Completed</SelectItem>
            <SelectItem value="LEFT">Left</SelectItem>
            <SelectItem value="ALL">All</SelectItem>
          </SelectContent>
        </Select>
        {canSeeBatches && (
          <Select
            value={batch}
            onValueChange={(v) => {
              setBatch(v);
              setPage(1);
            }}
          >
            <SelectTrigger className="sm:w-56" aria-label="Filter by batch">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>All batches</SelectItem>
              <SelectItem value={NO_BATCH}>No batch</SelectItem>
              {(batches.data ?? []).map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.name} · {b.course_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
      <DataTable
        columns={columns}
        rows={query.data?.items}
        getRowId={(s) => s.id}
        onRowClick={(s) => router.push(`/app/students/${s.id}`)}
        isLoading={query.isPending}
        error={query.error}
        onRetry={() => query.refetch()}
        pagination={query.data ? { page, pageSize: PAGE_SIZE, total: query.data.total, onPageChange: setPage } : undefined}
        empty={<EmptyState icon={UserRound} title={filtered ? "No students match." : "No students yet"} action={filtered ? undefined : add} />}
      />
    </>
  );
}
