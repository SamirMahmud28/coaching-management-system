"use client";

import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, GraduationCap, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { OneTimePasswordDialog } from "@/components/shared/one-time-password-dialog";
import { ActionIcons, FilterCard, ListPageHeader, RecordPhoto, RecordTable, type RecordColumn, type RowAction } from "@/components/shared/record-list";
import { EmptyState } from "@/components/shared/states";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { instructorsApi, type InstructorRow, type InstructorStatus } from "../../api";
import { instituteKeys } from "../../keys";
import { InstructorFormDialog } from "./instructor-form-dialog";
import { HowThisWorks } from "@/modules/institute/help/how-this-works";

const ALL = "ALL";
const GENDERS = { MALE: "Male", FEMALE: "Female", OTHER: "Other" } as const;
const DEFAULT_FILTERS: Record<string, string> = { status: "ACTIVE" };

/** The Instructor List: filters applied with Search, a ruled table, row actions, numbered pages. */
export function InstructorsListPage({ canManage }: { canManage: boolean }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [q, setQ] = useState("");
  const search = useDebouncedValue(q.trim(), 300);
  const [draft, setDraft] = useState(DEFAULT_FILTERS);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [creating, setCreating] = useState(false);
  const [oneTime, setOneTime] = useState<{ name: string; password: string } | null>(null);
  const status = filters.status as InstructorStatus | typeof ALL;
  const params = { q: search || undefined, status: status === ALL ? undefined : status, page, page_size: pageSize };
  const query = useQuery({ queryKey: instituteKeys.instructors(params), queryFn: () => instructorsApi.list(params), placeholderData: keepPreviousData });
  const filtering = search !== "" || filters.status !== DEFAULT_FILTERS.status;

  const columns: RecordColumn<InstructorRow>[] = [
    { key: "sl", header: "SL", className: "w-10 text-center tabular-nums", cell: (_, n) => n },
    { key: "photo", header: "Photo", className: "w-16", cell: (r) => <RecordPhoto fileId={r.photo_file_id} name={r.full_name} /> },
    {
      key: "instructor",
      header: "Instructor",
      cell: (r) => (
        <div className="min-w-36">
          <Link href={`/app/instructors/${r.id}`} className="text-[0.95rem] font-bold hover:underline">
            {r.full_name}
          </Link>
          <div className="text-xs text-muted-foreground">{r.must_change_password ? "Hasn't signed in yet" : "Instructor"}</div>
        </div>
      ),
    },
    {
      key: "gender",
      header: "Gender / Joined",
      className: "whitespace-nowrap",
      cell: (r) => (
        <div className="text-xs">
          <div>{r.gender ? GENDERS[r.gender] : "—"}</div>
          <div className="text-muted-foreground">Joined: {formatDate(r.created_at)}</div>
        </div>
      ),
    },
    {
      key: "phone",
      header: "Phone No",
      className: "whitespace-nowrap",
      cell: (r) => (
        <div>
          <div className="tabular-nums">{r.phone ?? "—"}</div>
          {r.email && <div className="text-xs text-muted-foreground">{r.email}</div>}
        </div>
      ),
    },
    { key: "status", header: "Status", cell: (r) => <StatusBadge status={r.status} /> },
    {
      key: "action",
      header: "Action",
      className: "whitespace-nowrap",
      cell: (r) => {
        const actions: RowAction[] = [{ label: "View", icon: Eye, href: `/app/instructors/${r.id}` }];
        return <ActionIcons name={r.full_name} actions={actions} />;
      },
    },
  ];

  const add = canManage ? (
    <Button onClick={() => setCreating(true)}>
      <Plus /> New instructor
    </Button>
  ) : null;

  return (
    <>
      <ListPageHeader title="Instructor List" crumb="Instructors" action={add} />
      <HowThisWorks topic="instructors" />

      <FilterCard
        fields={[
          {
            key: "status",
            label: "Status",
            placeholder: "Active",
            options: [
              { value: "ACTIVE", label: "Active" },
              { value: "INACTIVE", label: "Inactive" },
              { value: ALL, label: "All statuses" },
            ],
          },
        ]}
        draft={draft}
        onDraftChange={(key, value) => setDraft((d) => ({ ...d, [key]: value }))}
        onSearch={() => {
          setFilters(draft);
          setPage(1);
        }}
        onReset={() => {
          setQ("");
          setDraft(DEFAULT_FILTERS);
          setFilters(DEFAULT_FILTERS);
          setPage(1);
        }}
        canReset={q !== "" || draft.status !== DEFAULT_FILTERS.status || filters.status !== DEFAULT_FILTERS.status}
      />

      <RecordTable
        label="Instructors"
        columns={columns}
        rows={query.data?.items}
        getRowId={(r) => r.id}
        onRowClick={(r) => router.push(`/app/instructors/${r.id}`)}
        isLoading={query.isPending}
        error={query.error}
        onRetry={() => query.refetch()}
        empty={
          filtering ? (
            <EmptyState icon={GraduationCap} title="No instructors match" description="Try a different search, or reset the filters." />
          ) : (
            <EmptyState icon={GraduationCap} title="No instructors yet" action={add} />
          )
        }
        page={page}
        pageSize={pageSize}
        total={query.data?.total ?? 0}
        onPageChange={setPage}
        onPageSizeChange={(n) => {
          setPageSize(n);
          setPage(1);
        }}
        search={{
          value: q,
          onChange: (v) => {
            setQ(v);
            setPage(1);
          },
          placeholder: "Name, mobile or email",
          label: "Search instructors",
        }}
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
