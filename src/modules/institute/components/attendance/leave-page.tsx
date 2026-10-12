"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarOff, Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { FormField } from "@/components/shared/form-field";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState, ErrorState, LoadingState } from "@/components/shared/states";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { todayInDhaka } from "@/lib/dates";
import { notifySuccess } from "@/lib/feedback";
import { formatDate, formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { HowThisWorks } from "@/modules/institute/help/how-this-works";
import { leaveApi, studentsApi, type LeaveRow, type LeaveStatus } from "../../api";
import { instituteKeys } from "../../keys";
import { AttendanceTabs } from "./attendance-tabs";

const FILTERS: { value: LeaveStatus | "ALL"; label: string }[] = [
  { value: "PENDING", label: "Waiting" },
  { value: "APPROVED", label: "Approved" },
  { value: "REJECTED", label: "Rejected" },
  { value: "WITHDRAWN", label: "Withdrawn" },
  { value: "REVOKED", label: "Revoked" },
  { value: "ALL", label: "All" },
];

export const leaveDates = (l: Pick<LeaveRow, "from_date" | "to_date" | "days">) =>
  l.from_date === l.to_date ? formatDate(l.from_date) : `${formatDate(l.from_date)} – ${formatDate(l.to_date)} (${l.days} days)`;

type Dialog = { kind: "enter" } | { kind: "approve" | "reject" | "revoke"; leave: LeaveRow } | null;

/**
 * The office's leave (D89–D93): applications waiting for a decision first; approve or reject with an optional note the
 * student sees; enter leave for a student (approved at once); revoke approved leave with a reason.
 */
export function LeavePage({ canReport = false }: { canReport?: boolean }) {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<LeaveStatus | "ALL">("PENDING");
  const status = filter === "ALL" ? undefined : filter;
  const list = useQuery({ queryKey: instituteKeys.leave({ status }), queryFn: () => leaveApi.list({ status }) });
  const [dialog, setDialog] = useState<Dialog>(null);
  const [text, setText] = useState("");
  const [form, setForm] = useState({ from: todayInDhaka(), to: todayInDhaka() });
  const [search, setSearch] = useState("");
  const [student, setStudent] = useState<{ id: string; name: string; code: string } | null>(null);
  const found = useQuery({
    queryKey: instituteKeys.students({ q: search.trim(), page_size: 8 }),
    queryFn: () => studentsApi.list({ q: search.trim(), status: "ALL", page_size: 8 }),
    enabled: dialog?.kind === "enter" && search.trim().length >= 2 && !student,
  });

  const open = (d: NonNullable<Dialog>) => {
    setText("");
    setForm({ from: todayInDhaka(), to: todayInDhaka() });
    setSearch("");
    setStudent(null);
    setDialog(d);
  };
  const refresh = () => Promise.all([queryClient.invalidateQueries({ queryKey: ["institute-leave"] }), queryClient.invalidateQueries({ queryKey: ["institute-register"] })]);
  const excused = (n: number) => (n ? ` ${n} ${n === 1 ? "class" : "classes"} already taken marked Excused.` : "");

  return (
    <>
      <PageHeader
        title="Attendance"
        description="Leave applications and leave entered by the office."
        actions={
          <Button onClick={() => open({ kind: "enter" })}>
            <Plus /> Enter leave
          </Button>
        }
      />
      <AttendanceTabs canManageLeave canReport={canReport} />
      <HowThisWorks topic="attendance-leave" />

      <div className="flex flex-wrap gap-1" role="group" aria-label="Show">
        {FILTERS.map((f) => (
          <Button key={f.value} size="sm" variant={filter === f.value ? "default" : "outline"} aria-pressed={filter === f.value} onClick={() => setFilter(f.value)}>
            {f.label}
          </Button>
        ))}
      </div>

      {list.isPending ? (
        <LoadingState rows={4} />
      ) : list.error ? (
        <ErrorState message={list.error.message} onRetry={() => list.refetch()} />
      ) : list.data.length === 0 ? (
        <EmptyState icon={CalendarOff} title={filter === "PENDING" ? "Nothing is waiting for a decision" : "No leave here"} description="Students apply in their portal; you can also enter leave for a student." />
      ) : (
        <ul className="divide-y rounded-lg border" data-testid="leave-list">
          {list.data.map((l) => (
            <li key={l.id} className="flex flex-wrap items-start gap-3 px-4 py-3" data-testid={`leave-${l.student_code}`}>
              <div className="min-w-0 flex-1 space-y-0.5 text-sm">
                <p className="font-medium">
                  <Link href={`/app/students/${l.student_id}`} className="hover:underline">
                    {l.student_name}
                  </Link>{" "}
                  <span className="font-normal text-muted-foreground">· {l.student_code}</span>
                </p>
                <p>{leaveDates(l)}</p>
                <p className="text-muted-foreground">“{l.reason}”</p>
                <p className="text-xs text-muted-foreground">
                  {l.source === "OFFICE" ? `Entered by ${l.applied_by_name ?? "the office"}` : "Applied by the student"} on {formatDateTime(l.applied_at)}
                  {l.decided_at && l.source === "STUDENT" && ` · ${l.status === "REJECTED" ? "Rejected" : "Approved"} by ${l.decided_by_name ?? "—"}`}
                  {l.decision_note && ` · Note: ${l.decision_note}`}
                  {l.revoke_reason && ` · Revoked: ${l.revoke_reason}`}
                </p>
              </div>
              <StatusBadge status={l.status} label={l.status === "PENDING" ? "Waiting" : undefined} />
              <div className={cn("flex gap-2", l.status !== "PENDING" && l.status !== "APPROVED" && "hidden")}>
                {l.status === "PENDING" && (
                  <>
                    <Button size="sm" onClick={() => open({ kind: "approve", leave: l })}>
                      Approve
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => open({ kind: "reject", leave: l })}>
                      Reject
                    </Button>
                  </>
                )}
                {l.status === "APPROVED" && (
                  <Button size="sm" variant="outline" onClick={() => open({ kind: "revoke", leave: l })}>
                    Revoke
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={dialog?.kind === "approve" || dialog?.kind === "reject"}
        onOpenChange={(o) => !o && setDialog(null)}
        title={dialog && dialog.kind !== "enter" ? `${dialog.kind === "approve" ? "Approve" : "Reject"} ${dialog.leave.student_name}'s leave?` : ""}
        description={
          dialog?.kind === "approve"
            ? "The student's classes on these days become Excused — registers already taken change, and later ones start with the student as Excused."
            : "The application is closed and nothing changes on the registers. The student sees the decision and your note."
        }
        confirmLabel={dialog?.kind === "approve" ? "Approve" : "Reject"}
        destructive={dialog?.kind === "reject"}
        onConfirm={async () => {
          if (!dialog || dialog.kind === "enter") return;
          const row = await leaveApi.decide(dialog.leave.id, { decision: dialog.kind === "approve" ? "APPROVE" : "REJECT", note: text.trim() || null });
          notifySuccess(dialog.kind === "approve" ? `Leave approved.${excused(row.classes_excused)}` : "Leave rejected.");
          await refresh();
        }}
      >
        <FormField id="leave-note" label="Note for the student (optional)">
          <Textarea id="leave-note" rows={2} maxLength={300} value={text} onChange={(e) => setText(e.target.value)} />
        </FormField>
      </ConfirmDialog>

      <ConfirmDialog
        open={dialog?.kind === "revoke"}
        onOpenChange={(o) => !o && setDialog(null)}
        title={dialog?.kind === "revoke" ? `Revoke ${dialog.leave.student_name}'s leave?` : ""}
        description="The classes this leave excused go back to how they were marked, or to unmarked if nobody marked them. The leave stays on record as revoked."
        confirmLabel="Revoke leave"
        destructive
        confirmDisabled={!text.trim()}
        onConfirm={async () => {
          if (dialog?.kind !== "revoke") return;
          const row = await leaveApi.revoke(dialog.leave.id, text.trim());
          notifySuccess(`Leave revoked.${row.classes_restored ? ` ${row.classes_restored} ${row.classes_restored === 1 ? "class" : "classes"} restored.` : ""}`);
          await refresh();
        }}
      >
        <FormField id="revoke-reason" required label="Reason">
          <Textarea id="revoke-reason" rows={2} maxLength={300} value={text} onChange={(e) => setText(e.target.value)} />
        </FormField>
      </ConfirmDialog>

      <ConfirmDialog
        open={dialog?.kind === "enter"}
        onOpenChange={(o) => !o && setDialog(null)}
        title="Enter leave for a student"
        description="For leave a guardian asks for by phone or in person. It is approved at once, for any dates, and the student's classes on those days become Excused."
        confirmLabel="Enter leave"
        confirmDisabled={!student || !form.from || !form.to || !text.trim()}
        onConfirm={async () => {
          const row = await leaveApi.enter(student!.id, { from_date: form.from, to_date: form.to, reason: text.trim() });
          notifySuccess(`Leave entered for ${student!.name}.${excused(row.classes_excused)}`);
          await refresh();
        }}
      >
        <div className="space-y-3">
          {student ? (
            <div className="flex items-center gap-2 rounded-md border p-2 text-sm">
              <span className="flex-1">
                {student.name} <span className="text-muted-foreground">· {student.code}</span>
              </span>
              <Button variant="ghost" size="sm" onClick={() => setStudent(null)}>
                Change
              </Button>
            </div>
          ) : (
            <FormField id="leave-student" required label="Student" hint="Type at least 2 letters of the name, student ID or mobile number.">
              <Input id="leave-student" value={search} onChange={(e) => setSearch(e.target.value)} autoComplete="off" />
            </FormField>
          )}
          {!student && found.data && (
            <ul className="max-h-48 divide-y overflow-y-auto rounded-md border text-sm">
              {found.data.items.length === 0 && <li className="px-3 py-2 text-muted-foreground">No student found.</li>}
              {found.data.items.map((s) => (
                <li key={s.id}>
                  <button type="button" className="w-full px-3 py-2 text-left hover:bg-muted" onClick={() => setStudent({ id: s.id, name: s.full_name, code: s.student_code })}>
                    {s.full_name} <span className="text-muted-foreground">· {s.student_code}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="grid grid-cols-2 gap-3">
            <FormField id="leave-from" required label="First day">
              <Input id="leave-from" type="date" value={form.from} onChange={(e) => setForm({ ...form, from: e.target.value })} />
            </FormField>
            <FormField id="leave-to" required label="Last day">
              <Input id="leave-to" type="date" value={form.to} onChange={(e) => setForm({ ...form, to: e.target.value })} />
            </FormField>
          </div>
          <FormField id="leave-reason" required label="Reason">
            <Textarea id="leave-reason" rows={2} maxLength={300} value={text} onChange={(e) => setText(e.target.value)} />
          </FormField>
        </div>
      </ConfirmDialog>
    </>
  );
}
