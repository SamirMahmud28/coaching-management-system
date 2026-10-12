"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, ArchiveRestore, ArrowLeft, ChevronDown, MoreHorizontal, Pencil, Plus, Trash2, UserRound, Users, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { DeleteBlockedDialog } from "@/components/shared/delete-blocked-dialog";
import { PageHeader } from "@/components/shared/page-header";
import { ErrorState, LoadingState } from "@/components/shared/states";
import { StatusBadge } from "@/components/shared/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ApiError } from "@/lib/api-client";
import { runAction } from "@/lib/feedback";
import { academicApi, WEEKDAYS, type BatchSubjectRow, type Weekday } from "../../api";
import { instituteKeys } from "../../keys";
import { NameDialog } from "./name-dialog";

const DAY: Record<Weekday, string> = { SAT: "Saturday", SUN: "Sunday", MON: "Monday", TUE: "Tuesday", WED: "Wednesday", THU: "Thursday", FRI: "Friday" };
const SHORT_DAY = (d: Weekday) => DAY[d].slice(0, 3);

export function BatchPage({ id, canManage }: { id: string; canManage: boolean }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: instituteKeys.batch(id), queryFn: () => academicApi.batch(id) });
  const courseId = query.data?.course_id;
  const course = useQuery({ queryKey: instituteKeys.course(courseId ?? ""), queryFn: () => academicApi.course(courseId!), enabled: canManage && !!courseId });
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [blocked, setBlocked] = useState<ApiError | null>(null);
  const [subjectToAdd, setSubjectToAdd] = useState("");

  if (query.isPending) return <LoadingState rows={4} />;
  if (query.error) return <ErrorState message={query.error.message} onRetry={() => query.refetch()} />;
  const batch = query.data;
  const active = batch.status === "ACTIVE";
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: instituteKeys.batch(id) }),
      queryClient.invalidateQueries({ queryKey: instituteKeys.course(batch.course_id) }),
      queryClient.invalidateQueries({ queryKey: ["institute-courses"] }),
    ]);
  const setStatus = (status: "ACTIVE" | "ARCHIVED") =>
    runAction(
      async () => {
        await academicApi.updateBatch(id, { status });
        await refresh();
      },
      { success: status === "ARCHIVED" ? `${batch.name} archived.` : `${batch.name} restored.` },
    );
  const taken = new Set(batch.subjects.map((s) => s.subject_id));
  const addable = (course.data?.subjects ?? []).filter((s) => s.status === "ACTIVE" && !taken.has(s.id));

  const actions = canManage ? (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline">
          Actions <ChevronDown />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
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
        <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(true)}>
          <Trash2 /> Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  ) : null;

  return (
    <>
      <Link href={`/app/courses/${batch.course.id}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> {batch.course.name}
      </Link>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            {batch.name} <StatusBadge status={batch.status} />
          </span>
        }
        description={`Batch of ${batch.course.name} (${batch.course.code}): its subjects, who teaches them, and when classes meet.`}
        actions={actions}
      />

      {canManage && addable.length > 0 && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Select value={subjectToAdd} onValueChange={setSubjectToAdd}>
            <SelectTrigger className="sm:w-64" aria-label="Subject to add">
              <SelectValue placeholder="Pick a subject to add" />
            </SelectTrigger>
            <SelectContent>
              {addable.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            disabled={!subjectToAdd}
            onClick={() =>
              runAction(async () => {
                await academicApi.addBatchSubject(id, subjectToAdd);
                setSubjectToAdd("");
                await refresh();
              })
            }
          >
            <Plus /> Add subject
          </Button>
        </div>
      )}

      {batch.subjects.length === 0 ? (
        <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
          {canManage ? "No subjects yet. Add the subjects this batch takes." : "No subjects yet."}
        </p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {batch.subjects.map((s) => (
            <BatchSubjectCard key={s.id} item={s} canManage={canManage} onChanged={refresh} />
          ))}
        </div>
      )}

      <NameDialog
        open={renaming}
        onOpenChange={setRenaming}
        title="Rename batch"
        label="Batch name"
        initial={batch.name}
        submitLabel="Save"
        onSubmit={async (name) => {
          await academicApi.updateBatch(id, { name });
          await refresh();
        }}
      />
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={`Delete ${batch.name}?`}
        description="Its subjects, instructors and schedule are removed with it. A batch with students can't be deleted; archive it instead."
        confirmLabel="Delete"
        destructive
        onConfirm={async () => {
          await runAction(
            async () => {
              await academicApi.deleteBatch(id);
              await refresh();
              router.push(`/app/courses/${batch.course.id}`);
            },
            { success: `${batch.name} deleted.`, onBlocked: setBlocked },
          );
        }}
      />
      <DeleteBlockedDialog error={blocked} itemName={batch.name} onClose={() => setBlocked(null)} onInstead={active ? () => setStatus("ARCHIVED") : undefined} insteadLabel="Archive instead" />
    </>
  );
}

function BatchSubjectCard({ item, canManage, onChanged }: { item: BatchSubjectRow; canManage: boolean; onChanged: () => Promise<unknown> }) {
  const [choosing, setChoosing] = useState(false);
  const [removing, setRemoving] = useState(false);

  return (
    <Card data-testid="batch-subject" aria-label={item.subject_name}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {item.subject_name} {item.subject_status !== "ACTIVE" && <StatusBadge status={item.subject_status} />}
        </CardTitle>
        {canManage && (
          <CardAction>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="icon" variant="ghost" className="size-8" aria-label={`${item.subject_name} actions`}>
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => setChoosing(true)}>
                  <Users /> Choose instructors
                </DropdownMenuItem>
                <DropdownMenuItem variant="destructive" onSelect={() => setRemoving(true)}>
                  <Trash2 /> Remove from batch
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Instructors</p>
          {item.instructors.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No instructor yet.
              {canManage && (
                <Button variant="link" className="h-auto px-1 py-0" onClick={() => setChoosing(true)}>
                  Choose
                </Button>
              )}
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {item.instructors.map((i) => (
                <Badge key={i.id} variant="outline" className="gap-1">
                  <UserRound className="size-3" /> {i.full_name}
                  {i.status !== "ACTIVE" && <span className="text-muted-foreground">(inactive)</span>}
                </Badge>
              ))}
            </div>
          )}
        </div>
        <Schedule item={item} canManage={canManage} onChanged={onChanged} />
      </CardContent>

      <InstructorsDialog open={choosing} onOpenChange={setChoosing} item={item} onSaved={onChanged} />
      <ConfirmDialog
        open={removing}
        onOpenChange={setRemoving}
        title={`Remove ${item.subject_name} from this batch?`}
        description="Its instructors and class times in this batch are removed too."
        confirmLabel="Remove"
        destructive
        onConfirm={async () => {
          await academicApi.removeBatchSubject(item.id);
          await onChanged();
        }}
      />
    </Card>
  );
}

function Schedule({ item, canManage, onChanged }: { item: BatchSubjectRow; canManage: boolean; onChanged: () => Promise<unknown> }) {
  const [weekday, setWeekday] = useState<Weekday | "">("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [saving, setSaving] = useState(false);
  const idPrefix = `slot-${item.id}`;

  async function add() {
    if (!weekday) return;
    setSaving(true);
    await runAction(async () => {
      await academicApi.addSlot(item.id, { weekday, starts_at: startsAt, ends_at: endsAt });
      setStartsAt("");
      setEndsAt("");
      await onChanged();
    });
    setSaving(false);
  }

  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Weekly schedule</p>
      {item.slots.length === 0 ? (
        <p className="text-sm text-muted-foreground">No class times yet.</p>
      ) : (
        <ul className="space-y-1">
          {item.slots.map((s) => (
            <li key={s.id} className="flex items-center gap-2 text-sm">
              <span className="w-10 font-medium">{SHORT_DAY(s.weekday)}</span>
              <span className="font-mono">
                {s.starts_at}–{s.ends_at}
              </span>
              {canManage && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-6"
                  aria-label={`Remove ${DAY[s.weekday]} ${s.starts_at} class`}
                  onClick={() =>
                    runAction(async () => {
                      await academicApi.removeSlot(s.id);
                      await onChanged();
                    })
                  }
                >
                  <X className="size-3.5" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {canManage && (
        <div className="flex flex-wrap items-end gap-2 pt-2">
          <div className="space-y-1">
            <Label htmlFor={`${idPrefix}-day`} className="text-xs">
              Day
            </Label>
            <Select value={weekday} onValueChange={(v) => setWeekday(v as Weekday)}>
              <SelectTrigger id={`${idPrefix}-day`} className="w-32" size="sm">
                <SelectValue placeholder="Day" />
              </SelectTrigger>
              <SelectContent>
                {WEEKDAYS.map((d) => (
                  <SelectItem key={d} value={d}>
                    {DAY[d]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor={`${idPrefix}-start`} className="text-xs">
              Starts
            </Label>
            <Input id={`${idPrefix}-start`} type="time" className="h-8 w-28" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`${idPrefix}-end`} className="text-xs">
              Ends
            </Label>
            <Input id={`${idPrefix}-end`} type="time" className="h-8 w-28" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
          </div>
          <Button size="sm" variant="outline" onClick={add} disabled={saving || !weekday || !startsAt || !endsAt}>
            <Plus /> Add class time
          </Button>
        </div>
      )}
    </div>
  );
}

/** Picks who teaches the subject in this batch: active instructors, plus any deactivated one still assigned. */
function InstructorsDialog({ open, onOpenChange, item, onSaved }: { open: boolean; onOpenChange: (open: boolean) => void; item: BatchSubjectRow; onSaved: () => Promise<unknown> }) {
  const options = useQuery({ queryKey: instituteKeys.assignableInstructors(), queryFn: academicApi.assignableInstructors, enabled: open });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const all = [
    ...(options.data ?? []),
    ...item.instructors.filter((i) => i.status !== "ACTIVE").map((i) => ({ id: i.id, full_name: `${i.full_name} (inactive)` })),
  ];

  async function save() {
    setSaving(true);
    const ok = await runAction(
      async () => {
        await academicApi.setInstructors(item.id, [...selected]);
        await onSaved();
      },
      { success: "Instructors saved." },
    );
    setSaving(false);
    if (ok) onOpenChange(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) setSelected(new Set(item.instructors.map((i) => i.id)));
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Instructors for {item.subject_name}</DialogTitle>
          <DialogDescription>They see this batch in the instructor portal.</DialogDescription>
        </DialogHeader>
        {options.isPending ? (
          <LoadingState rows={3} />
        ) : all.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No active instructors yet. Add them under{" "}
            <Link href="/app/instructors" className="underline">
              Instructors
            </Link>
            .
          </p>
        ) : (
          <ul className="max-h-72 space-y-2 overflow-y-auto">
            {all.map((i) => (
              <li key={i.id} className="flex items-center gap-2">
                <Checkbox
                  id={`pick-${item.id}-${i.id}`}
                  checked={selected.has(i.id)}
                  onCheckedChange={(checked) =>
                    setSelected((prev) => {
                      const next = new Set(prev);
                      if (checked) next.add(i.id);
                      else next.delete(i.id);
                      return next;
                    })
                  }
                />
                <Label htmlFor={`pick-${item.id}-${i.id}`} className="font-normal">
                  {i.full_name}
                </Label>
              </li>
            ))}
          </ul>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving || options.isPending}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
