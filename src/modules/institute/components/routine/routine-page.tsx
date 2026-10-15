"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useState } from "react";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { FormField } from "@/components/shared/form-field";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState, ErrorState, LoadingState } from "@/components/shared/states";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { notifySuccess } from "@/lib/feedback";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { HowThisWorks } from "@/modules/institute/help/how-this-works";
import { routineApi, type RoutineClassRow, type RoutineOptions } from "../../api";
import { instituteKeys } from "../../keys";
import { RoutineTabs } from "./routine-tabs";

type View = "day" | "batch" | "instructor" | "changes";
const VIEWS: { value: View; label: string }[] = [
  { value: "day", label: "Day" },
  { value: "batch", label: "Batch week" },
  { value: "instructor", label: "Instructor week" },
  { value: "changes", label: "Changes & holidays" },
];
const shift = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
const dayName = (date: string) => new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short", timeZone: "UTC" });

export const STATUS: Record<RoutineClassRow["status"], { label: string; tone: "success" | "secondary" | "warning" | "info" | "destructive" }> = {
  SCHEDULED: { label: "On", tone: "success" },
  CANCELLED: { label: "Cancelled", tone: "destructive" },
  HOLIDAY: { label: "Holiday", tone: "secondary" },
  MOVED_AWAY: { label: "Moved", tone: "warning" },
  MOVED_IN: { label: "Moved here", tone: "info" },
};

/** What changed about a class, in a few words. */
export function changeNote(c: RoutineClassRow) {
  if (c.status === "MOVED_AWAY" && c.moved_to) return `Moved to ${formatDate(c.moved_to.date)}, ${c.moved_to.starts_at}–${c.moved_to.ends_at}`;
  if (c.status === "MOVED_IN" && c.moved_from) return `Moved from ${formatDate(c.moved_from.date)}, ${c.moved_from.starts_at}`;
  if (c.status === "CANCELLED" || c.status === "HOLIDAY") return c.reason;
  if (c.substitute_name) return `Substitute: ${c.substitute_name}`;
  return null;
}

type Dialog = { kind: "change"; cls: RoutineClassRow } | { kind: "withdraw"; cls: RoutineClassRow } | { kind: "holiday" } | null;

/**
 * The routine: the classes of a day, a batch's week or an instructor's week with every change shown, and
 * (for the office) cancelling, rescheduling, substituting, holidays and withdrawing a change.
 */
export function RoutinePage({ canManage, base = "/app/routine", fullGuide = true }: { canManage: boolean; base?: string; fullGuide?: boolean }) {
  const options = useQuery({ queryKey: instituteKeys.routine("options"), queryFn: () => routineApi.options() });
  const [view, setView] = useState<View>("day");
  if (options.isPending) return <LoadingState rows={6} />;
  if (options.error) return <ErrorState message={options.error.message} onRetry={() => options.refetch()} />;
  return (
    <>
      <PageHeader title="Routine" description="Classes with their changes: cancellations, reschedules, substitutes and holidays." />
      <RoutineTabs base={base} />
      <HowThisWorks topic="routine" fullGuide={fullGuide} />
      <div className="flex flex-wrap gap-1" role="group" aria-label="View">
        {VIEWS.map((v) => (
          <Button key={v.value} size="sm" variant={view === v.value ? "default" : "outline"} aria-pressed={view === v.value} onClick={() => setView(v.value)}>
            {v.label}
          </Button>
        ))}
      </div>
      {view === "changes" ? <ChangesView canManage={canManage} today={options.data.today} /> : <ClassesView key={view} view={view} options={options.data} canManage={canManage} />}
    </>
  );
}

function ClassesView({ view, options, canManage }: { view: Exclude<View, "changes">; options: RoutineOptions; canManage: boolean }) {
  const queryClient = useQueryClient();
  const [from, setFrom] = useState(options.today);
  const [batchId, setBatchId] = useState(options.batches[0]?.id ?? "");
  const [instructorId, setInstructorId] = useState(options.instructors[0]?.id ?? "");
  const [dialog, setDialog] = useState<Dialog>(null);
  const days = view === "day" ? 1 : 7;
  const ready = view === "day" || (view === "batch" ? !!batchId : !!instructorId);
  const data = useQuery({
    queryKey: instituteKeys.routine(view, from, batchId, instructorId),
    queryFn: () => (view === "day" ? routineApi.day(from).then((d) => d.classes) : view === "batch" ? routineApi.batchWeek(batchId, from).then((d) => d.classes) : routineApi.instructorWeek(instructorId, from).then((d) => d.classes)),
    enabled: ready,
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["institute-routine"] });
  const dates = Array.from({ length: days }, (_, i) => shift(from, i));

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {view === "batch" && (
          <Select value={batchId} onValueChange={setBatchId}>
            <SelectTrigger aria-label="Batch" className="w-56">
              <SelectValue placeholder="Choose a batch" />
            </SelectTrigger>
            <SelectContent>
              {options.batches.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.course_name} · {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {view === "instructor" && (
          <Select value={instructorId} onValueChange={setInstructorId}>
            <SelectTrigger aria-label="Instructor" className="w-56">
              <SelectValue placeholder="Choose an instructor" />
            </SelectTrigger>
            <SelectContent>
              {options.instructors.map((i) => (
                <SelectItem key={i.id} value={i.id}>
                  {i.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Button variant="outline" size="icon" aria-label={view === "day" ? "Previous day" : "Previous week"} onClick={() => setFrom(shift(from, -days))}>
          <ChevronLeft />
        </Button>
        <Input type="date" aria-label="From" className="w-auto" value={from} onChange={(e) => e.target.value && setFrom(e.target.value)} />
        <Button variant="outline" size="icon" aria-label={view === "day" ? "Next day" : "Next week"} onClick={() => setFrom(shift(from, days))}>
          <ChevronRight />
        </Button>
        {from !== options.today && (
          <Button variant="ghost" onClick={() => setFrom(options.today)}>
            Today
          </Button>
        )}
      </div>

      {!ready ? (
        <EmptyState icon={CalendarClock} title="Nothing to show" description="No batches or instructors to show yet." />
      ) : data.isPending ? (
        <LoadingState rows={6} />
      ) : data.error ? (
        <ErrorState message={data.error.message} onRetry={() => data.refetch()} />
      ) : (
        <div className="space-y-4" data-testid="routine-classes">
          {dates.map((date) => {
            const classes = data.data.filter((c) => c.date === date);
            return (
              <section key={date} aria-label={dayName(date)}>
                <h2 className="mb-1.5 text-sm font-semibold">
                  {dayName(date)}
                  {date === options.today && <span className="ml-2 font-normal text-muted-foreground">today</span>}
                </h2>
                {classes.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No classes.</p>
                ) : (
                  <ul className="surface-glass-dense divide-y rounded-lg border">
                    {classes.map((c) => {
                      const s = STATUS[c.status];
                      const note = changeNote(c);
                      const off = c.status === "CANCELLED" || c.status === "HOLIDAY" || c.status === "MOVED_AWAY";
                      return (
                        <li key={`${c.batch_subject_id}-${c.date}-${c.starts_at}-${c.status}`} className="flex flex-wrap items-center gap-3 px-3 py-2" data-testid={`class-${c.subject_name}-${c.date}-${c.starts_at}`}>
                          <span className={cn("w-24 shrink-0 text-sm tabular-nums", off && "text-muted-foreground line-through")}>
                            {c.starts_at}–{c.ends_at}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className={cn("font-medium", off && "text-muted-foreground")}>
                              {c.subject_name} <span className="font-normal text-muted-foreground">· {c.batch_name}</span>
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {c.instructors.map((i) => i.name).join(", ") || "No instructor"}
                              {note && ` · ${note}`}
                            </p>
                          </div>
                          {c.status !== "SCHEDULED" || c.substitute_name ? <StatusBadge status={c.status} label={c.substitute_name && c.status === "SCHEDULED" ? "Substitute" : s.label} tone={c.substitute_name && c.status === "SCHEDULED" ? "info" : s.tone} /> : null}
                          {canManage && c.status === "SCHEDULED" && !c.change_id && (
                            <Button size="sm" variant="outline" onClick={() => setDialog({ kind: "change", cls: c })}>
                              Change
                            </Button>
                          )}
                          {canManage && c.change_id && c.status !== "HOLIDAY" && c.status !== "MOVED_IN" && (
                            <Button size="sm" variant="ghost" onClick={() => setDialog({ kind: "withdraw", cls: c })}>
                              Undo change
                            </Button>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      )}

      {dialog?.kind === "change" && <ChangeDialog cls={dialog.cls} today={options.today} instructors={options.instructors} onClose={() => setDialog(null)} onSaved={refresh} />}
      <ConfirmDialog
        open={dialog?.kind === "withdraw"}
        onOpenChange={(o) => !o && setDialog(null)}
        title="Undo this change?"
        description="The class goes back to its regular time and instructor. The change stays on record as withdrawn."
        confirmLabel="Undo change"
        onConfirm={async () => {
          if (dialog?.kind !== "withdraw") return;
          await routineApi.withdrawChange(dialog.cls.change_id!);
          notifySuccess("Change withdrawn.");
          await refresh();
        }}
      />
    </>
  );
}

function ChangeDialog({ cls, today, instructors, onClose, onSaved }: { cls: RoutineClassRow; today: string; instructors: RoutineOptions["instructors"]; onClose: () => void; onSaved: () => Promise<unknown> }) {
  const [kind, setKind] = useState<"CANCEL" | "RESCHEDULE" | "SUBSTITUTE">("CANCEL");
  const [reason, setReason] = useState("");
  const [newDate, setNewDate] = useState(cls.date);
  const [newStart, setNewStart] = useState(cls.starts_at);
  const [newEnd, setNewEnd] = useState(cls.ends_at);
  const [substitute, setSubstitute] = useState("");
  const past = cls.date < today;
  const reasonRequired = kind === "CANCEL" || past;
  const candidates = instructors.filter((i) => i.status === "ACTIVE" && !cls.regular_instructors.some((r) => r.id === i.id));
  const ok = (!reasonRequired || reason.trim()) && (kind !== "RESCHEDULE" || (newDate && newStart && newEnd)) && (kind !== "SUBSTITUTE" || substitute);

  return (
    <ConfirmDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Change ${cls.subject_name} · ${cls.batch_name}`}
      description={`${formatDate(cls.date)}, ${cls.starts_at}–${cls.ends_at}. Only this one class changes; the weekly time stays.${past ? " This class is in the past, so a reason is needed." : ""}`}
      confirmLabel="Save change"
      confirmDisabled={!ok}
      onConfirm={async () => {
        await routineApi.createChange({
          batch_subject_id: cls.batch_subject_id, class_date: cls.date, starts_at: cls.starts_at, kind, reason: reason.trim() || null,
          ...(kind === "RESCHEDULE" ? { new_date: newDate, new_starts_at: newStart, new_ends_at: newEnd } : {}),
          ...(kind === "SUBSTITUTE" ? { substitute_instructor_id: substitute } : {}),
        });
        notifySuccess(kind === "CANCEL" ? "Class cancelled." : kind === "RESCHEDULE" ? "Class rescheduled." : "Substitute set.");
        await onSaved();
      }}
    >
      <div className="space-y-3">
        <FormField id="change-kind" label="What changes">
          <Select value={kind} onValueChange={(v) => setKind(v as typeof kind)}>
            <SelectTrigger id="change-kind" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="CANCEL">Cancel this class</SelectItem>
              <SelectItem value="RESCHEDULE">Move it to another time</SelectItem>
              <SelectItem value="SUBSTITUTE">Another instructor takes it</SelectItem>
            </SelectContent>
          </Select>
        </FormField>
        {kind === "RESCHEDULE" && (
          <div className="grid grid-cols-3 gap-2">
            <FormField id="change-date" required label="New date">
              <Input id="change-date" type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} />
            </FormField>
            <FormField id="change-start" required label="Starts">
              <Input id="change-start" type="time" value={newStart} onChange={(e) => setNewStart(e.target.value)} />
            </FormField>
            <FormField id="change-end" required label="Ends">
              <Input id="change-end" type="time" value={newEnd} onChange={(e) => setNewEnd(e.target.value)} />
            </FormField>
          </div>
        )}
        {kind === "SUBSTITUTE" && (
          <FormField id="change-substitute" required label="Substitute" hint="Only instructors free at this time can be chosen; you'll be told if they aren't.">
            <Select value={substitute} onValueChange={setSubstitute}>
              <SelectTrigger id="change-substitute" className="w-full">
                <SelectValue placeholder="Choose an instructor" />
              </SelectTrigger>
              <SelectContent>
                {candidates.map((i) => (
                  <SelectItem key={i.id} value={i.id}>
                    {i.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
        )}
        <FormField id="change-reason" required={reasonRequired} label="Reason" hint="Students and instructors see it, e.g. 'Instructor ill'.">
          <Textarea id="change-reason" rows={2} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />
        </FormField>
      </div>
    </ConfirmDialog>
  );
}

function ChangesView({ canManage, today }: { canManage: boolean; today: string }) {
  const queryClient = useQueryClient();
  const list = useQuery({ queryKey: instituteKeys.routine("changes"), queryFn: () => routineApi.changes() });
  const [adding, setAdding] = useState(false);
  const [withdrawing, setWithdrawing] = useState<{ kind: "change" | "holiday"; id: string; label: string } | null>(null);
  const [form, setForm] = useState({ name: "", from: today, to: today });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["institute-routine"] });

  if (list.isPending) return <LoadingState rows={4} />;
  if (list.error) return <ErrorState message={list.error.message} onRetry={() => list.refetch()} />;
  const { changes, holidays } = list.data;

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <div className="flex items-center gap-2">
          <h2 className="flex-1 text-lg font-semibold">Holidays</h2>
          {canManage && (
            <Button
              size="sm"
              onClick={() => {
                setForm({ name: "", from: today, to: today });
                setAdding(true);
              }}
            >
              <Plus /> Add holiday
            </Button>
          )}
        </div>
        {holidays.length === 0 ? (
          <p className="text-sm text-muted-foreground">No holidays coming up.</p>
        ) : (
          <ul className="surface-glass-dense divide-y rounded-lg border" data-testid="holidays">
            {holidays.map((h) => (
              <li key={h.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                <span className="flex-1">
                  <span className="font-medium">{h.name}</span> · {h.from_date === h.to_date ? formatDate(h.from_date) : `${formatDate(h.from_date)} – ${formatDate(h.to_date)}`}
                </span>
                {canManage && (
                  <Button size="sm" variant="ghost" onClick={() => setWithdrawing({ kind: "holiday", id: h.id, label: h.name })}>
                    Withdraw
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Class changes</h2>
        <p className="text-sm text-muted-foreground">From a week ago on. To change a class, find it in the Day or Week view and click Change.</p>
        {changes.length === 0 ? (
          <p className="text-sm text-muted-foreground">No changes.</p>
        ) : (
          <ul className="surface-glass-dense divide-y rounded-lg border" data-testid="changes">
            {changes.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {c.subject_name} · {c.batch_name} — {formatDate(c.class_date)}, {c.starts_at}
                  </p>
                  <p className="text-muted-foreground">
                    {c.kind === "CANCEL" ? "Cancelled" : c.kind === "RESCHEDULE" ? `Moved to ${formatDate(c.new_date)}, ${c.new_starts_at}–${c.new_ends_at}` : `Substitute: ${c.substitute_name}`}
                    {c.reason && ` · ${c.reason}`}
                  </p>
                </div>
                {canManage && (
                  <Button size="sm" variant="ghost" onClick={() => setWithdrawing({ kind: "change", id: c.id, label: `${c.subject_name} on ${formatDate(c.class_date)}` })}>
                    Undo
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <ConfirmDialog
        open={adding}
        onOpenChange={setAdding}
        title="Add a holiday"
        description="Every class on these days is cancelled for all batches. Students and instructors see it in their week."
        confirmLabel="Add holiday"
        confirmDisabled={!form.name.trim() || !form.from}
        onConfirm={async () => {
          await routineApi.createHoliday({ name: form.name.trim(), from_date: form.from, to_date: form.to || null });
          notifySuccess("Holiday added.");
          await refresh();
        }}
      >
        <div className="space-y-3">
          <FormField id="holiday-name" required label="Name" hint="e.g. Victory Day, Eid ul-Fitr.">
            <Input id="holiday-name" maxLength={120} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </FormField>
          <div className="grid grid-cols-2 gap-2">
            <FormField id="holiday-from" required label="First day">
              <Input id="holiday-from" type="date" value={form.from} onChange={(e) => setForm({ ...form, from: e.target.value, to: form.to < e.target.value ? e.target.value : form.to })} />
            </FormField>
            <FormField id="holiday-to" label="Last day">
              <Input id="holiday-to" type="date" value={form.to} onChange={(e) => setForm({ ...form, to: e.target.value })} />
            </FormField>
          </div>
        </div>
      </ConfirmDialog>
      <ConfirmDialog
        open={withdrawing !== null}
        onOpenChange={(o) => !o && setWithdrawing(null)}
        title={withdrawing ? `Withdraw ${withdrawing.kind === "holiday" ? "the holiday" : "the change to"} ${withdrawing.label}?` : ""}
        description="The classes go back to their regular times and instructors. The record stays as withdrawn."
        confirmLabel="Withdraw"
        onConfirm={async () => {
          if (!withdrawing) return;
          if (withdrawing.kind === "holiday") await routineApi.withdrawHoliday(withdrawing.id);
          else await routineApi.withdrawChange(withdrawing.id);
          notifySuccess("Withdrawn.");
          await refresh();
        }}
      />
    </div>
  );
}
