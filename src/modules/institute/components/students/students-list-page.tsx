"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Eye, Plus, UserRound, Wallet } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ActionIcons, FilterCard, ListPageHeader, RecordPhoto, RecordTable, type FilterField, type RecordColumn, type RowAction } from "@/components/shared/record-list";
import { EmptyState } from "@/components/shared/states";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { academicApi, studentsApi, type StudentListRow, type StudentStatus } from "../../api";
import { instituteKeys } from "../../keys";
import { HowThisWorks } from "@/modules/institute/help/how-this-works";

const ALL = "ALL";
const NO_BATCH = "NONE";
const GENDERS = { MALE: "Male", FEMALE: "Female", OTHER: "Other" } as const;
const STATUSES: { value: StudentStatus | typeof ALL; label: string }[] = [
  { value: "ACTIVE", label: "Active" },
  { value: "ON_HOLD", label: "On hold" },
  { value: "COMPLETED", label: "Completed" },
  { value: "LEFT", label: "Left" },
  { value: ALL, label: "All statuses" },
];
const DEFAULT_FILTERS: Record<string, string> = { courseId: ALL, batchId: ALL, status: "ACTIVE" };
const pick = (value: string) => (value === ALL || value === NO_BATCH ? undefined : value);

/** The Student List: filters applied with Search, a ruled table, row actions, numbered pages. */
export function StudentsListPage({
  canAdmit,
  canSeeContacts,
  canSeeBatches,
  canViewFees = false,
}: {
  canAdmit: boolean;
  canSeeContacts: boolean;
  canSeeBatches: boolean;
  canViewFees?: boolean;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const search = useDebouncedValue(q.trim(), 300);
  // What is chosen in the filter card, and what was last applied with Search.
  const [draft, setDraft] = useState(DEFAULT_FILTERS);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const filtering = search !== "" || Object.keys(DEFAULT_FILTERS).some((k) => filters[k] !== DEFAULT_FILTERS[k]);

  const params = {
    q: search || undefined,
    status: filters.status as StudentStatus | "ALL",
    course_id: pick(filters.courseId),
    batch_id: pick(filters.batchId),
    no_batch: filters.batchId === NO_BATCH ? ("true" as const) : undefined,
    page,
    page_size: pageSize,
  };
  const query = useQuery({ queryKey: instituteKeys.students(params), queryFn: () => studentsApi.list(params), placeholderData: keepPreviousData });
  const courses = useQuery({ queryKey: instituteKeys.courses({ status: "ACTIVE" }), queryFn: () => academicApi.courses({ status: "ACTIVE" }), enabled: canSeeBatches });
  const batches = useQuery({ queryKey: instituteKeys.batches({ status: "ACTIVE" }), queryFn: () => academicApi.batches({ status: "ACTIVE" }), enabled: canSeeBatches });

  const batchOptions = (batches.data ?? []).filter((b) => draft.courseId === ALL || b.course_id === draft.courseId);
  const fields: FilterField[] = [
    ...(canSeeBatches
      ? [
          {
            key: "courseId",
            label: "Course",
            placeholder: "All courses",
            options: [{ value: ALL, label: "All courses" }, ...(courses.data ?? []).map((c) => ({ value: c.id, label: c.name }))],
          },
          {
            key: "batchId",
            label: "Batch",
            placeholder: "All batches",
            options: [
              { value: ALL, label: "All batches" },
              { value: NO_BATCH, label: "No batch" },
              ...batchOptions.map((b) => ({ value: b.id, label: draft.courseId === ALL ? `${b.name} · ${b.course_name}` : b.name })),
            ],
          },
        ]
      : []),
    { key: "status", label: "Status", placeholder: "Active", options: STATUSES },
  ];

  const columns: RecordColumn<StudentListRow>[] = [
    { key: "sl", header: "SL", className: "w-10 text-center tabular-nums", cell: (_, n) => n },
    { key: "photo", header: "Photo", className: "w-16", cell: (r) => <RecordPhoto fileId={r.photo_file_id} name={r.full_name} /> },
    {
      key: "student",
      header: "Student",
      cell: (r) => (
        <div className="min-w-36">
          <Link href={`/app/students/${r.id}`} className="text-[0.95rem] font-bold hover:underline">
            {r.full_name}
          </Link>
          <div className="text-xs text-muted-foreground">{r.batches.length ? r.batches.map((b) => b.name).join(" - ") : "No batch"}</div>
        </div>
      ),
    },
    { key: "guardian", header: "Guardian", cell: (r) => <div className="font-medium">{r.guardian_name || "—"}</div> },
    { key: "gender", header: "Gender", className: "whitespace-nowrap text-xs", cell: (r) => GENDERS[r.gender] },
    {
      key: "id",
      header: "Student ID",
      className: "whitespace-nowrap",
      cell: (r) => <span className="font-mono text-xs">{r.student_code}</span>,
    },
    ...(canSeeContacts
      ? [{ key: "phone", header: "Guardian's Phone", className: "whitespace-nowrap tabular-nums", cell: (r: StudentListRow) => r.guardian_phone ?? "—" }]
      : []),
    { key: "status", header: "Status", cell: (r) => <StatusBadge status={r.status} /> },
    {
      key: "action",
      header: "Action",
      className: "whitespace-nowrap",
      cell: (r) => {
        const actions: RowAction[] = [{ label: "View", icon: Eye, href: `/app/students/${r.id}` }];
        if (canViewFees) actions.push({ label: "Fees", ariaLabel: `Fees of ${r.full_name}`, icon: Wallet, href: `/app/fees/students/${r.id}` });
        return <ActionIcons name={r.full_name} actions={actions} />;
      },
    },
  ];

  const add = canAdmit ? (
    <Button asChild>
      <Link href="/app/students/new">
        <Plus /> Admit student
      </Link>
    </Button>
  ) : null;

  return (
    <>
      <ListPageHeader title="Student List" crumb="Students" action={add} />
      <HowThisWorks topic="student-records" />

      <FilterCard
        fields={fields}
        draft={draft}
        onDraftChange={(key, value) => setDraft((d) => ({ ...d, [key]: value, ...(key === "courseId" ? { batchId: ALL } : {}) }))}
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
        canReset={q !== "" || Object.keys(DEFAULT_FILTERS).some((k) => draft[k] !== DEFAULT_FILTERS[k] || filters[k] !== DEFAULT_FILTERS[k])}
      />

      <RecordTable
        label="Students"
        columns={columns}
        rows={query.data?.items}
        getRowId={(r) => r.id}
        onRowClick={(r) => router.push(`/app/students/${r.id}`)}
        isLoading={query.isPending}
        error={query.error}
        onRetry={() => query.refetch()}
        empty={
          filtering ? (
            <EmptyState icon={UserRound} title="No students match" description="Try a different search, or reset the filters." />
          ) : (
            <EmptyState icon={UserRound} title="No students yet" action={add} />
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
          placeholder: canSeeContacts ? "Name, ID or mobile" : "Name or ID",
          label: "Search students",
        }}
      />
    </>
  );
}
