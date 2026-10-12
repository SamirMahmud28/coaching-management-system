"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, ArchiveRestore, ArrowLeft, ChevronDown, ChevronRight, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { DeleteBlockedDialog } from "@/components/shared/delete-blocked-dialog";
import { PageHeader } from "@/components/shared/page-header";
import { ErrorState, LoadingState } from "@/components/shared/states";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { ApiError } from "@/lib/api-client";
import { notifySuccess, runAction } from "@/lib/feedback";
import { academicApi, type SubjectRow } from "../../api";
import { instituteKeys } from "../../keys";
import { CourseFormDialog, dueDayLabel } from "./course-form-dialog";
import { NameDialog } from "./name-dialog";

export function CoursePage({ id, canManage }: { id: string; canManage: boolean }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: instituteKeys.course(id), queryFn: () => academicApi.course(id) });
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [blocked, setBlocked] = useState<ApiError | null>(null);
  const [addingSubject, setAddingSubject] = useState(false);
  const [addingBatch, setAddingBatch] = useState(false);

  if (query.isPending) return <LoadingState rows={4} />;
  if (query.error) return <ErrorState message={query.error.message} onRetry={() => query.refetch()} />;
  const course = query.data;
  const active = course.status === "ACTIVE";
  const refresh = () =>
    Promise.all([queryClient.invalidateQueries({ queryKey: instituteKeys.course(id) }), queryClient.invalidateQueries({ queryKey: ["institute-courses"] })]);
  const setStatus = (status: "ACTIVE" | "ARCHIVED") =>
    runAction(
      async () => {
        await academicApi.setCourseStatus(id, status);
        await refresh();
      },
      { success: status === "ARCHIVED" ? `${course.name} archived.` : `${course.name} restored.` },
    );

  const actions = canManage ? (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline">
          Actions <ChevronDown />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem onSelect={() => setEditing(true)}>
          <Pencil /> Edit course
        </DropdownMenuItem>
        {active ? (
          <DropdownMenuItem onSelect={() => setStatus("ARCHIVED")}>
            <Archive /> Archive
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem onSelect={() => setStatus("ACTIVE")}>
            <ArchiveRestore /> Restore
          </DropdownMenuItem>
        )}
        <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(true)}>
          <Trash2 /> Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  ) : null;

  return (
    <>
      <Link href="/app/courses" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Courses & batches
      </Link>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            {course.name} <StatusBadge status={course.status} />
          </span>
        }
        description={
          <>
            Code <span className="font-mono">{course.code}</span> · Monthly fee due: {dueDayLabel(course.due_day)}
            {course.description && <span className="mt-1 block">{course.description}</span>}
          </>
        }
        actions={actions}
      />
      {!active && <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">This course is archived. Restore it to add subjects or batches.</p>}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Batches</CardTitle>
            <CardDescription>Groups of students. Each batch takes some of the course&apos;s subjects.</CardDescription>
            {canManage && active && (
              <CardAction>
                <Button size="sm" variant="outline" onClick={() => setAddingBatch(true)} disabled={course.subjects.length === 0}>
                  <Plus /> New batch
                </Button>
              </CardAction>
            )}
          </CardHeader>
          <CardContent>
            {course.batches.length === 0 ? (
              <p className="text-sm text-muted-foreground">{course.subjects.length === 0 ? "Add the course's subjects first, then its batches." : "No batches yet."}</p>
            ) : (
              <ul className="divide-y rounded-md border">
                {course.batches.map((b) => (
                  <li key={b.id}>
                    <Link href={`/app/batches/${b.id}`} className="flex items-center gap-3 px-3 py-2 hover:bg-muted/50">
                      <span className="min-w-0 flex-1 truncate font-medium">{b.name}</span>
                      <span className="text-sm text-muted-foreground">
                        {b.subject_count} {b.subject_count === 1 ? "subject" : "subjects"}
                      </span>
                      {b.status !== "ACTIVE" && <StatusBadge status={b.status} />}
                      <ChevronRight className="size-4 text-muted-foreground" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Subjects</CardTitle>
            <CardDescription>What the course teaches.</CardDescription>
            {canManage && active && (
              <CardAction>
                <Button size="sm" variant="outline" onClick={() => setAddingSubject(true)}>
                  <Plus /> Add subject
                </Button>
              </CardAction>
            )}
          </CardHeader>
          <CardContent>
            {course.subjects.length === 0 ? (
              <p className="text-sm text-muted-foreground">No subjects yet.</p>
            ) : (
              <ul className="divide-y rounded-md border">
                {course.subjects.map((s) => (
                  <SubjectItem key={s.id} subject={s} canManage={canManage} onChanged={refresh} />
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <CourseFormDialog
        open={editing}
        onOpenChange={setEditing}
        course={course}
        onSubmit={async (fields) => {
          await academicApi.updateCourse(id, fields);
          await refresh();
          notifySuccess("Course saved.");
        }}
      />
      <NameDialog
        open={addingSubject}
        onOpenChange={setAddingSubject}
        title="Add subject"
        label="Subject name"
        submitLabel="Add subject"
        onSubmit={async (name) => {
          await academicApi.createSubject(id, name);
          await refresh();
        }}
      />
      <NameDialog
        open={addingBatch}
        onOpenChange={setAddingBatch}
        title="New batch"
        description="You'll pick its subjects, instructors and class times next."
        label="Batch name"
        submitLabel="Add batch"
        onSubmit={async (name) => {
          const batch = await academicApi.createBatch(id, name);
          await refresh();
          router.push(`/app/batches/${batch.id}`);
        }}
      />
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={`Delete ${course.name}?`}
        description="Only a course with no subjects or batches can be deleted. Archive it instead to keep its history."
        confirmLabel="Delete"
        destructive
        onConfirm={async () => {
          await runAction(
            async () => {
              await academicApi.deleteCourse(id);
              await queryClient.invalidateQueries({ queryKey: ["institute-courses"] });
              router.push("/app/courses");
            },
            { success: `${course.name} deleted.`, onBlocked: setBlocked },
          );
        }}
      />
      <DeleteBlockedDialog error={blocked} itemName={course.name} onClose={() => setBlocked(null)} onInstead={active ? () => setStatus("ARCHIVED") : undefined} insteadLabel="Archive instead" />
    </>
  );
}

function SubjectItem({ subject, canManage, onChanged }: { subject: SubjectRow; canManage: boolean; onChanged: () => Promise<unknown> }) {
  const [renaming, setRenaming] = useState(false);
  const [blocked, setBlocked] = useState<ApiError | null>(null);
  const active = subject.status === "ACTIVE";
  const setStatus = (status: "ACTIVE" | "ARCHIVED") =>
    runAction(async () => {
      await academicApi.updateSubject(subject.id, { status });
      await onChanged();
    });

  return (
    <li className="flex items-center gap-3 px-3 py-2">
      <span className="min-w-0 flex-1 truncate">{subject.name}</span>
      {!active && <StatusBadge status={subject.status} />}
      {canManage && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon" variant="ghost" className="size-8" aria-label={`${subject.name} actions`}>
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => setRenaming(true)}>
              <Pencil /> Rename
            </DropdownMenuItem>
            {active ? (
              <DropdownMenuItem onSelect={() => setStatus("ARCHIVED")}>
                <Archive /> Archive
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem onSelect={() => setStatus("ACTIVE")}>
                <ArchiveRestore /> Restore
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              variant="destructive"
              onSelect={() =>
                runAction(
                  async () => {
                    await academicApi.deleteSubject(subject.id);
                    await onChanged();
                  },
                  { success: `${subject.name} deleted.`, onBlocked: setBlocked },
                )
              }
            >
              <Trash2 /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      <NameDialog
        open={renaming}
        onOpenChange={setRenaming}
        title="Rename subject"
        label="Subject name"
        initial={subject.name}
        submitLabel="Save"
        onSubmit={async (name) => {
          await academicApi.updateSubject(subject.id, { name });
          await onChanged();
        }}
      />
      <DeleteBlockedDialog error={blocked} itemName={subject.name} onClose={() => setBlocked(null)} onInstead={active ? () => setStatus("ARCHIVED") : undefined} insteadLabel="Archive instead" />
    </li>
  );
}
