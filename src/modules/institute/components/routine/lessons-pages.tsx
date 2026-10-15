"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowLeft, ArrowUp, BookOpenCheck, ChevronRight, Copy, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { FormField } from "@/components/shared/form-field";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState, ErrorState, LoadingState } from "@/components/shared/states";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { notifySuccess, runAction } from "@/lib/feedback";
import { formatDate } from "@/lib/format";
import { HowThisWorks } from "@/modules/institute/help/how-this-works";
import { lessonsApi, type LessonProgress, type LessonTopicRow, type TopicStatus } from "../../api";
import { instituteKeys } from "../../keys";
import { RoutineTabs } from "./routine-tabs";

export const TOPIC_STATUS: Record<TopicStatus, { label: string; tone: "secondary" | "info" | "success" }> = {
  PENDING: { label: "Pending", tone: "secondary" },
  ONGOING: { label: "Ongoing", tone: "info" },
  COMPLETED: { label: "Completed", tone: "success" },
};

export function ProgressBar({ progress }: { progress: LessonProgress }) {
  return (
    <div className="space-y-1">
      <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={progress.percent ?? 0} aria-valuemin={0} aria-valuemax={100} aria-label="Topics completed">
        <div className="h-full bg-success" style={{ width: `${progress.percent ?? 0}%` }} />
      </div>
      <p className="text-xs text-muted-foreground">
        {progress.total === 0 ? "No topics yet" : `${progress.completed} of ${progress.total} topics completed${progress.ongoing ? ` · ${progress.ongoing} ongoing` : ""}`}
        {progress.overdue > 0 && <span className="font-medium text-destructive"> · {progress.overdue} overdue</span>}
      </p>
    </div>
  );
}

/** Every visible batch subject with its plan's progress. */
export function LessonOverviewPage({ base, fullGuide = true }: { base: string; fullGuide?: boolean }) {
  const list = useQuery({ queryKey: instituteKeys.lessons("overview"), queryFn: () => lessonsApi.overview() });
  return (
    <>
      <PageHeader title="Routine" description="Lesson plans: the topics each batch covers in each subject, and how far they've got." />
      <RoutineTabs base={base} />
      <HowThisWorks topic="lesson-plans" fullGuide={fullGuide} />
      {list.isPending ? (
        <LoadingState rows={4} />
      ) : list.error ? (
        <ErrorState message={list.error.message} onRetry={() => list.refetch()} />
      ) : list.data.length === 0 ? (
        <EmptyState icon={BookOpenCheck} title="No subjects yet" description="Lesson plans belong to a subject of a batch. Add subjects to batches first." />
      ) : (
        <ul className="surface-glass-dense divide-y rounded-lg border" data-testid="lesson-overview">
          {list.data.map((p) => (
            <li key={p.id}>
              <Link href={`${base}/lessons/${p.id}`} className="flex items-center gap-4 px-4 py-3 hover:bg-muted/50">
                <div className="min-w-0 flex-1 space-y-1.5">
                  <p className="font-medium">
                    {p.subject_name} <span className="font-normal text-muted-foreground">· {p.batch_name} · {p.course_name}</span>
                  </p>
                  <ProgressBar progress={p.progress} />
                </div>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/** One batch subject's plan: topics in order, status by hand, Overdue, and editing for those allowed. */
export function LessonPlanPage({ base, batchSubjectId, fullGuide = true }: { base: string; batchSubjectId: string; fullGuide?: boolean }) {
  const queryClient = useQueryClient();
  const plan = useQuery({ queryKey: instituteKeys.lessons("plan", batchSubjectId), queryFn: () => lessonsApi.plan(batchSubjectId) });
  const [form, setForm] = useState({ title: "", start: "", target: "" });
  const [editing, setEditing] = useState<LessonTopicRow | null>(null);
  const [edit, setEdit] = useState({ title: "", start: "", target: "" });
  const [deleting, setDeleting] = useState<LessonTopicRow | null>(null);
  const [copying, setCopying] = useState(false);
  const [source, setSource] = useState("");
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["institute-lessons"] });

  if (plan.isPending) return <LoadingState rows={6} />;
  if (plan.error) return <ErrorState message={plan.error.message} onRetry={() => plan.refetch()} />;
  const p = plan.data;

  const add = () =>
    runAction(async () => {
      await lessonsApi.addTopic(p.id, { title: form.title.trim(), start_date: form.start || null, target_date: form.target || null });
      setForm({ title: "", start: "", target: "" });
      await refresh();
    });
  const move = (i: number, by: number) =>
    runAction(async () => {
      const ids = p.topics.map((t) => t.id);
      [ids[i], ids[i + by]] = [ids[i + by], ids[i]];
      await lessonsApi.reorder(p.id, ids);
      await refresh();
    });

  return (
    <>
      <Link href={`${base}/lessons`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Lesson plans
      </Link>
      <PageHeader
        title={`${p.subject_name} · ${p.batch_name}`}
        description={p.course_name}
        actions={
          p.copy_sources.length > 0 ? (
            <Button variant="outline" onClick={() => setCopying(true)}>
              <Copy /> Copy from another batch
            </Button>
          ) : null
        }
      />
      <HowThisWorks topic="lesson-plans" fullGuide={fullGuide} />
      <ProgressBar progress={p.progress} />

      {p.topics.length === 0 ? (
        <EmptyState icon={BookOpenCheck} title="No topics yet" description={p.editable ? "Add the chapters or topics this batch will cover, in order." : "The instructor hasn't added topics yet."} />
      ) : (
        <ol className="surface-glass-dense divide-y rounded-lg border" data-testid="lesson-topics">
          {p.topics.map((t, i) => (
            <li key={t.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5" data-testid={`topic-${t.title}`}>
              <span className="w-6 text-right text-sm text-muted-foreground tabular-nums">{i + 1}.</span>
              <div className="min-w-0 flex-1">
                <p className="font-medium">{t.title}</p>
                <p className="text-xs text-muted-foreground">
                  {t.start_date ? `From ${formatDate(t.start_date)}` : "No start date"} · {t.target_date ? `target ${formatDate(t.target_date)}` : "no target date"}
                  {t.completed_on && ` · completed ${formatDate(t.completed_on)}`}
                </p>
              </div>
              {t.overdue && <StatusBadge status="OVERDUE" label="Overdue" tone="destructive" />}
              {p.editable ? (
                <Select
                  value={t.status}
                  onValueChange={(v) =>
                    runAction(async () => {
                      await lessonsApi.updateTopic(t.id, { status: v as TopicStatus });
                      await refresh();
                    })
                  }
                >
                  <SelectTrigger aria-label={`${t.title} status`} className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(TOPIC_STATUS) as TopicStatus[]).map((s) => (
                      <SelectItem key={s} value={s}>
                        {TOPIC_STATUS[s].label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <StatusBadge status={t.status} label={TOPIC_STATUS[t.status].label} tone={TOPIC_STATUS[t.status].tone} />
              )}
              {p.editable && (
                <div className="flex">
                  <Button variant="ghost" size="icon" aria-label={`Move ${t.title} up`} disabled={i === 0} onClick={() => move(i, -1)}>
                    <ArrowUp />
                  </Button>
                  <Button variant="ghost" size="icon" aria-label={`Move ${t.title} down`} disabled={i === p.topics.length - 1} onClick={() => move(i, 1)}>
                    <ArrowDown />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setEdit({ title: t.title, start: t.start_date ?? "", target: t.target_date ?? "" });
                      setEditing(t);
                    }}
                  >
                    Edit
                  </Button>
                  <Button variant="ghost" size="icon" aria-label={`Delete ${t.title}`} onClick={() => setDeleting(t)}>
                    <Trash2 />
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ol>
      )}

      {p.editable && (
        <div className="surface-glass-item grid gap-3 rounded-lg border p-3 sm:grid-cols-[3fr_1fr_1fr_auto] sm:items-end" data-testid="add-topic">
          <FormField id="topic-title" label="Chapter or topic">
            <Input id="topic-title" maxLength={200} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </FormField>
          <FormField id="topic-start" label="Start">
            <Input id="topic-start" type="date" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} />
          </FormField>
          <FormField id="topic-target" label="Target">
            <Input id="topic-target" type="date" value={form.target} onChange={(e) => setForm({ ...form, target: e.target.value })} />
          </FormField>
          <Button onClick={add} disabled={!form.title.trim()}>
            <Plus /> Add topic
          </Button>
        </div>
      )}

      <ConfirmDialog
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        title="Edit topic"
        confirmLabel="Save"
        confirmDisabled={!edit.title.trim()}
        onConfirm={async () => {
          await lessonsApi.updateTopic(editing!.id, { title: edit.title.trim(), start_date: edit.start || null, target_date: edit.target || null });
          await refresh();
        }}
      >
        <div className="space-y-3">
          <FormField id="edit-title" required label="Chapter or topic">
            <Input id="edit-title" maxLength={200} value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} />
          </FormField>
          <div className="grid grid-cols-2 gap-2">
            <FormField id="edit-start" label="Start">
              <Input id="edit-start" type="date" value={edit.start} onChange={(e) => setEdit({ ...edit, start: e.target.value })} />
            </FormField>
            <FormField id="edit-target" label="Target">
              <Input id="edit-target" type="date" value={edit.target} onChange={(e) => setEdit({ ...edit, target: e.target.value })} />
            </FormField>
          </div>
        </div>
      </ConfirmDialog>
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={deleting ? `Delete "${deleting.title}"?` : ""}
        description="The topic is removed from this batch's plan."
        confirmLabel="Delete topic"
        destructive
        onConfirm={async () => {
          await lessonsApi.deleteTopic(deleting!.id);
          await refresh();
        }}
      />
      <ConfirmDialog
        open={copying}
        onOpenChange={setCopying}
        title="Copy topics from another batch"
        description="The other batch's topics are added to the end of this plan, in the same order, as Pending and without dates — set this batch's dates afterwards."
        confirmLabel="Copy topics"
        confirmDisabled={!source}
        onConfirm={async () => {
          const res = await lessonsApi.copy(p.id, source);
          notifySuccess(`${res.copied} ${res.copied === 1 ? "topic" : "topics"} copied.`);
          await refresh();
        }}
      >
        <FormField id="copy-source" required label="Copy from">
          <Select value={source} onValueChange={setSource}>
            <SelectTrigger id="copy-source" className="w-full">
              <SelectValue placeholder="Choose a batch" />
            </SelectTrigger>
            <SelectContent>
              {p.copy_sources.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.batch_name} · {s.course_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
      </ConfirmDialog>
    </>
  );
}
