"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Ban, Loader2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { FormField } from "@/components/shared/form-field";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState, ErrorState, LoadingState } from "@/components/shared/states";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { notifySuccess, runAction } from "@/lib/feedback";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { HowThisWorks } from "@/modules/institute/help/how-this-works";
import { attendanceApi, type AttendanceStatus, type Register } from "../../api";
import { instituteKeys } from "../../keys";
import { CLASS_STATE } from "./day-classes-page";

const CHOICES: { status: AttendanceStatus; short: string; label: string; on: string }[] = [
  { status: "PRESENT", short: "P", label: "Present", on: "bg-success text-white border-success" },
  { status: "ABSENT", short: "A", label: "Absent", on: "bg-destructive text-white border-destructive" },
  { status: "LATE", short: "L", label: "Late", on: "bg-warning text-black border-warning" },
  { status: "EXCUSED", short: "E", label: "Excused", on: "bg-info text-white border-info" },
];

/**
 * One class's register. A register not yet taken starts everyone Present; tap the exceptions and save.
 * Students on approved leave show as Excused through their leave. After the class day only Owner/Admin can change it,
 * with a reason.
 */
export function RegisterPage({ base, batchSubjectId, date, startsAt, fullGuide = true }: { base: string; batchSubjectId: string; date: string; startsAt: string; fullGuide?: boolean }) {
  const key = instituteKeys.register(batchSubjectId, date, startsAt);
  const register = useQuery({ queryKey: key, queryFn: () => attendanceApi.register(batchSubjectId, { date, starts_at: startsAt }) });
  const back = `${base}?date=${date}`;

  return (
    <>
      <Link href={back} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Classes on {formatDate(date)}
      </Link>
      {register.isPending ? (
        <LoadingState rows={6} />
      ) : register.error ? (
        <ErrorState message={register.error.message} onRetry={() => register.refetch()} />
      ) : (
        // Keyed by the loaded register, so the marks start again from what was saved.
        <RegisterForm key={`${register.data.state}-${register.dataUpdatedAt}`} data={register.data} queryKey={key} fullGuide={fullGuide} />
      )}
    </>
  );
}

function RegisterForm({ data, queryKey, fullGuide }: { data: Register; queryKey: readonly unknown[]; fullGuide: boolean }) {
  const queryClient = useQueryClient();
  const [marks, setMarks] = useState<Map<string, AttendanceStatus | null>>(() => new Map(data.rows.map((r) => [r.student_id, r.status])));
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [notHeld, setNotHeld] = useState(false);
  const [notHeldReason, setNotHeldReason] = useState("");
  const at = { date: data.date, starts_at: data.starts_at };
  const taken = data.state === "TAKEN";
  const effective = (r: Register["rows"][number]) => (r.on_leave ? "EXCUSED" : marks.get(r.student_id));
  const counts = CHOICES.map((c) => ({ ...c, n: data.rows.filter((r) => effective(r) === c.status).length }));
  const changed = data.rows.some((r) => !r.on_leave && marks.get(r.student_id) !== r.status);
  const state = CLASS_STATE[data.state];

  const refresh = async (next: Register) => {
    queryClient.setQueryData(queryKey, next);
    await queryClient.invalidateQueries({ queryKey: ["institute-attendance-day"] });
  };

  async function save() {
    setSaving(true);
    await runAction(async () => {
      const sent = data.rows.flatMap((r) => {
        const status = marks.get(r.student_id);
        return !r.on_leave && status ? [{ student_id: r.student_id, status }] : [];
      });
      const next = await attendanceApi.save(data.batch_subject_id, { ...at, marks: sent, reason: reason.trim() || null });
      notifySuccess(taken ? "Register updated." : "Register saved.");
      await refresh(next);
    });
    setSaving(false);
  }

  return (
    <>
      <PageHeader
        title={`${data.subject_name} · ${data.batch_name}`}
        description={`${data.course_name} · ${formatDate(data.date)}, ${data.starts_at}–${data.ends_at}${data.source === "EXTRA" ? " · Extra class" : ""}`}
        actions={<StatusBadge status={data.state} label={state.label} tone={state.tone} />}
      />
      <HowThisWorks topic="attendance-registers" fullGuide={fullGuide} />

      {data.state === "NOT_HELD" && (
        <p role="status" className="bg-card/50 rounded-md border border-dashed p-3 text-sm">
          Marked as <strong>no class held</strong>: {data.not_held_reason}. It counts for nobody&apos;s attendance.
          {data.can_edit && " If the class did happen, take the register below."}
        </p>
      )}
      {!data.can_edit && data.why_not && (
        <p role="status" className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">
          {data.why_not}
        </p>
      )}

      {data.rows.length === 0 ? (
        <EmptyState title="No students on this register" description="The batch had no current students on this day. On Hold students are left off registers." />
      ) : (
        <>
          <p className="text-sm text-muted-foreground" data-testid="register-counts">
            {counts.map((c) => `${c.label} ${c.n}`).join(" · ")}
          </p>
          <ul className="surface-glass-dense divide-y rounded-lg border" data-testid="register">
            {data.rows.map((r) => {
              const current = marks.get(r.student_id);
              return (
                <li key={r.student_id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5" data-testid={`row-${r.student_code}`}>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">
                      {r.roll_number && <span className="mr-1.5 text-muted-foreground tabular-nums">{r.roll_number}.</span>}
                      {r.full_name}
                    </p>
                    <p className="text-xs text-muted-foreground">{r.student_code}</p>
                  </div>
                  {r.on_leave ? (
                    <StatusBadge status="EXCUSED" label="Excused · on leave" tone="info" />
                  ) : (
                    <div role="radiogroup" aria-label={`${r.full_name} attendance`} className="flex gap-1">
                      {CHOICES.map((c) => (
                        <button
                          key={c.status}
                          type="button"
                          role="radio"
                          aria-checked={current === c.status}
                          aria-label={c.label}
                          title={c.label}
                          disabled={!data.can_edit}
                          onClick={() => setMarks(new Map(marks).set(r.student_id, c.status))}
                          className={cn(
                            "size-10 rounded-md border text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60",
                            current === c.status ? c.on : "bg-background hover:bg-muted",
                          )}
                        >
                          {c.short}
                        </button>
                      ))}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}

      {data.can_edit && (
        <div className="space-y-3">
          {data.reason_required && (
            <FormField id="register-reason" required label="Reason for changing a past day's register" hint="Recorded in the audit log with each change.">
              <Textarea id="register-reason" rows={2} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />
            </FormField>
          )}
          <div className="flex flex-wrap gap-2">
            <Button onClick={save} disabled={saving || (taken && !changed) || (data.reason_required && !reason.trim())}>
              {saving && <Loader2 className="animate-spin" />}
              {taken ? "Save changes" : "Save register"}
            </Button>
            {data.state !== "NOT_HELD" && !taken && (
              <Button variant="outline" onClick={() => setNotHeld(true)}>
                <Ban /> No class held
              </Button>
            )}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={notHeld}
        onOpenChange={setNotHeld}
        title="Mark as no class held?"
        description="Use this when a scheduled class didn't happen. It then counts for nobody's attendance. You can still take the register later the same day if it did happen."
        confirmLabel="Mark not held"
        confirmDisabled={!notHeldReason.trim()}
        onConfirm={async () => {
          const next = await attendanceApi.notHeld(data.batch_subject_id, { ...at, reason: notHeldReason.trim() });
          notifySuccess("Marked as no class held.");
          await refresh(next);
        }}
      >
        <FormField id="not-held-reason" required label="Reason" hint="For example: instructor ill, holiday, exam day.">
          <Textarea id="not-held-reason" rows={2} maxLength={300} value={notHeldReason} onChange={(e) => setNotHeldReason(e.target.value)} />
        </FormField>
      </ConfirmDialog>
    </>
  );
}
