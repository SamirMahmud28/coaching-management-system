"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { DataTable, type Column } from "@/components/shared/data-table";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/states";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { notifySuccess } from "@/lib/feedback";
import { academicApi, type AcademicStatus, type CourseRow } from "../../api";
import { instituteKeys } from "../../keys";
import { CourseFormDialog } from "./course-form-dialog";

export function CoursesListPage({ canManage }: { canManage: boolean }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<AcademicStatus | "ALL">("ACTIVE");
  const [creating, setCreating] = useState(false);
  const params = { status: status === "ALL" ? undefined : status };
  const query = useQuery({ queryKey: instituteKeys.courses(params), queryFn: () => academicApi.courses(params) });

  const columns: Column<CourseRow>[] = [
    { key: "name", header: "Course", cell: (c) => <span className="font-medium">{c.name}</span> },
    { key: "code", header: "Code", cell: (c) => <span className="font-mono text-sm">{c.code}</span> },
    { key: "subjects", header: "Subjects", cell: (c) => c.subject_count, className: "hidden sm:table-cell" },
    { key: "batches", header: "Batches", cell: (c) => c.batch_count },
    { key: "status", header: "Status", cell: (c) => <StatusBadge status={c.status} /> },
  ];

  const add = canManage ? (
    <Button onClick={() => setCreating(true)}>
      <Plus /> New course
    </Button>
  ) : null;

  return (
    <>
      <PageHeader title="Courses & batches" description="Each course has its subjects and its batches; each batch has its instructors and weekly schedule." actions={add} />
      <Select value={status} onValueChange={(v) => setStatus(v as AcademicStatus | "ALL")}>
        <SelectTrigger className="sm:w-40" aria-label="Filter by status">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="ACTIVE">Active</SelectItem>
          <SelectItem value="ARCHIVED">Archived</SelectItem>
          <SelectItem value="ALL">All</SelectItem>
        </SelectContent>
      </Select>
      <DataTable
        columns={columns}
        rows={query.data}
        getRowId={(c) => c.id}
        onRowClick={(c) => router.push(`/app/courses/${c.id}`)}
        isLoading={query.isPending}
        error={query.error}
        onRetry={() => query.refetch()}
        empty={<EmptyState icon={BookOpen} title={status === "ACTIVE" ? "No courses yet" : "No courses match."} description={status === "ACTIVE" ? "Start with a course, then add its subjects and batches." : undefined} action={status === "ACTIVE" ? add : undefined} />}
      />

      <CourseFormDialog
        open={creating}
        onOpenChange={setCreating}
        onSubmit={async (fields) => {
          const created = await academicApi.createCourse(fields);
          await queryClient.invalidateQueries({ queryKey: ["institute-courses"] });
          notifySuccess(`${created.name} added.`);
          router.push(`/app/courses/${created.id}`);
        }}
      />
    </>
  );
}
