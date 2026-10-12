"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ChevronDown, KeyRound, MoreHorizontal, Pencil, Plus, RefreshCcw, UserRound } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { FormField } from "@/components/shared/form-field";
import { OneTimePasswordDialog } from "@/components/shared/one-time-password-dialog";
import { PageHeader } from "@/components/shared/page-header";
import { PasswordField } from "@/components/shared/password-field";
import { ErrorState, LoadingState } from "@/components/shared/states";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { todayInDhaka } from "@/lib/dates";
import { formatDate, formatDateTime } from "@/lib/format";
import { runAction } from "@/lib/feedback";
import { academicApi, studentsApi, type MembershipRow, type StudentDetail, type StudentStatus } from "../../api";
import { instituteKeys } from "../../keys";
import { StudentFeeAmountsCard } from "../fees/student-fee-amounts-card";
import { GENDER_LABEL, RELATION_LABEL, StudentFieldsForm, studentFieldsFrom, studentFormFrom, studentFormMissing, type StudentFormValues } from "./student-fields";
import { HowThisWorks } from "@/modules/institute/help/how-this-works";

const STATUS_LABEL: Record<StudentStatus, string> = { ACTIVE: "Active", ON_HOLD: "On hold", COMPLETED: "Completed", LEFT: "Left" };
// The decided moves (D9, D10, D18); the server enforces the same table.
const NEXT: Record<StudentStatus, StudentStatus[]> = { ACTIVE: ["ON_HOLD", "COMPLETED", "LEFT"], ON_HOLD: ["ACTIVE", "COMPLETED", "LEFT"], COMPLETED: ["ACTIVE"], LEFT: ["ACTIVE"] };
const STATUS_EFFECT: Record<StudentStatus, string> = {
  ACTIVE: "They can sign in again. Past batches stay closed; add them to batches again if needed.",
  ON_HOLD: "They can't sign in, get no new monthly fees, and are left off attendance and new exams. Their batches stay as they are.",
  COMPLETED: "They can't sign in, and every current batch is closed as Completed today.",
  LEFT: "They can't sign in, and every current batch is closed as Left today. Dues stay payable.",
};

export interface StudentPermissions {
  canUpdate: boolean;
  canSetStatus: boolean;
  canManageBatches: boolean;
  canSeeContacts: boolean;
  /** Fees module on and fees.view held. */
  canViewFees: boolean;
  canAdjustFees: boolean;
}

export function StudentProfilePage({ id, perms }: { id: string; perms: StudentPermissions }) {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: instituteKeys.student(id), queryFn: () => studentsApi.get(id) });
  const [editing, setEditing] = useState(false);
  const [changingStatus, setChangingStatus] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [password, setPassword] = useState("");
  const [oneTime, setOneTime] = useState<{ name: string; password: string; signInWith?: string } | null>(null);
  const [joining, setJoining] = useState(false);

  if (query.isPending) return <LoadingState rows={6} />;
  if (query.error) return <ErrorState message={query.error.message} onRetry={() => query.refetch()} />;
  const student = query.data;
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: instituteKeys.student(id) }),
      queryClient.invalidateQueries({ queryKey: ["institute-students"] }),
      queryClient.invalidateQueries({ queryKey: ["institute-batch-students"] }),
    ]);
  const current = student.status === "ACTIVE" || student.status === "ON_HOLD";

  const actions =
    perms.canUpdate || perms.canSetStatus ? (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline">
            Actions <ChevronDown />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          {perms.canUpdate && (
            <DropdownMenuItem onSelect={() => setEditing(true)}>
              <Pencil /> Edit details
            </DropdownMenuItem>
          )}
          {perms.canSetStatus && (
            <DropdownMenuItem onSelect={() => setChangingStatus(true)}>
              <RefreshCcw /> Change status
            </DropdownMenuItem>
          )}
          {perms.canUpdate && (
            <DropdownMenuItem onSelect={() => setResetting(true)}>
              <KeyRound /> Reset password
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    ) : null;

  return (
    <>
      <Link href="/app/students" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Students
      </Link>
      <div className="flex items-start gap-4">
        <div className="flex h-20 w-16 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted">
          {student.photo_file_id ? (
            // eslint-disable-next-line @next/next/no-img-element -- authenticated, tenant-scoped bytes
            <img src={`/api/v1/files/${student.photo_file_id}`} alt="" className="size-full object-cover" />
          ) : (
            <UserRound aria-hidden className="size-6 text-muted-foreground" />
          )}
        </div>
        <PageHeader
          className="min-w-0 flex-1"
          title={
            <span className="flex flex-wrap items-center gap-3">
              {student.full_name} <StatusBadge status={student.status} />
            </span>
          }
          description={
            <>
              Student ID <span className="font-mono font-medium text-foreground" data-testid="student-code">{student.student_code}</span>
              {student.must_change_password && student.status === "ACTIVE" ? " · Hasn't signed in yet (temporary password)." : null}
            </>
          }
          actions={actions}
        />
      </div>
      <HowThisWorks topic="student-records" />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent>
            <Details student={student} canSeeContacts={perms.canSeeContacts} />
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Batches</CardTitle>
              {perms.canManageBatches && current && (
                <CardAction>
                  <Button size="sm" variant="outline" onClick={() => setJoining(true)}>
                    <Plus /> Add to batch
                  </Button>
                </CardAction>
              )}
            </CardHeader>
            <CardContent>
              {student.memberships.length === 0 ? (
                <p className="text-sm text-muted-foreground">Not in any batch yet.</p>
              ) : (
                <ul className="divide-y rounded-md border">
                  {student.memberships.map((m) => (
                    <MembershipItem key={m.id} membership={m} canManage={perms.canManageBatches} onChanged={refresh} />
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {perms.canViewFees && <StudentFeeAmountsCard studentId={id} canAdjust={perms.canAdjustFees} />}

          <Card>
            <CardHeader>
              <CardTitle>Status history</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="space-y-3 text-sm">
                {student.status_history.map((h) => (
                  <li key={h.id} className="flex flex-col gap-0.5">
                    <span>
                      <span className="font-medium">{h.from_status ? `${STATUS_LABEL[h.from_status]} → ${STATUS_LABEL[h.to_status]}` : "Admitted"}</span>
                      {h.reason && h.from_status ? <span className="text-muted-foreground"> — {h.reason}</span> : null}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formatDateTime(h.changed_at)}
                      {h.changed_by_name ? ` · ${h.changed_by_name}` : ""}
                    </span>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </div>
      </div>

      <EditStudentDialog open={editing} onOpenChange={setEditing} student={student} withContacts={perms.canSeeContacts} onSaved={refresh} />
      <StatusDialog open={changingStatus} onOpenChange={setChangingStatus} student={student} onSaved={refresh} />
      <JoinBatchDialog open={joining} onOpenChange={setJoining} student={student} onSaved={refresh} />
      <ConfirmDialog
        open={resetting}
        onOpenChange={(open) => {
          setResetting(open);
          if (!open) setPassword("");
        }}
        title={`Reset ${student.full_name}'s password?`}
        description="They're signed out everywhere and must choose a new password at their next sign-in."
        confirmLabel="Reset password"
        confirmDisabled={!password}
        onConfirm={async () => {
          await studentsApi.resetPassword(id, password);
          setOneTime({ name: student.full_name, password, signInWith: student.student_code });
          setPassword("");
          await refresh();
        }}
      >
        <FormField id="student-reset-password" required label="Temporary password">
          <PasswordField id="student-reset-password" value={password} onChange={setPassword} withGenerate />
        </FormField>
      </ConfirmDialog>
      <OneTimePasswordDialog value={oneTime} onClose={() => setOneTime(null)} />
    </>
  );
}

function Details({ student, canSeeContacts }: { student: StudentDetail; canSeeContacts: boolean }) {
  const rows: [string, React.ReactNode][] = [
    ["Gender", GENDER_LABEL[student.gender]],
    ["Date of birth", student.date_of_birth ? formatDate(student.date_of_birth) : "—"],
    ...(canSeeContacts ? ([["Student's mobile", student.phone ? <span className="font-mono">{student.phone}</span> : "—"]] as [string, React.ReactNode][]) : []),
    ["School or college", [student.school_name, student.school_class].filter(Boolean).join(", ") || "—"],
    ["Guardian", `${student.guardian_name} (${RELATION_LABEL[student.guardian_relation]})`],
    ...(canSeeContacts
      ? ([
          ["Guardian's mobile", <span key="g" className="font-mono">{student.guardian_phone}</span>],
          ["Address", student.address ?? "—"],
        ] as [string, React.ReactNode][])
      : []),
    ["Admitted", formatDate(student.admission_date)],
    ["Admission course", student.admission_course ? `${student.admission_course.name} (${student.admission_course.code})` : "—"],
    ["Staff note", student.admin_note ?? "—"],
  ];
  return (
    <dl className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-[10rem_1fr]">
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="min-w-0 wrap-break-word whitespace-pre-line">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function MembershipItem({ membership: m, canManage, onChanged }: { membership: MembershipRow; canManage: boolean; onChanged: () => Promise<unknown> }) {
  const [editingRoll, setEditingRoll] = useState(false);
  const [ending, setEnding] = useState(false);
  const [roll, setRoll] = useState(m.roll_number ?? "");
  const [endStatus, setEndStatus] = useState<"COMPLETED" | "LEFT">("COMPLETED");
  const [endedOn, setEndedOn] = useState(todayInDhaka());
  const active = m.status === "ACTIVE";

  return (
    <li className="flex items-center gap-3 px-3 py-2 text-sm" data-testid="membership">
      <div className="min-w-0 flex-1">
        <Link href={`/app/batches/${m.batch_id}`} className="font-medium hover:underline">
          {m.batch_name}
        </Link>{" "}
        <span className="text-muted-foreground">· {m.course_name}</span>
        <div className="text-xs text-muted-foreground">
          {formatDate(m.started_on)} – {m.ended_on ? formatDate(m.ended_on) : "now"}
          {m.roll_number ? ` · Roll ${m.roll_number}` : ""}
        </div>
      </div>
      {!active && <StatusBadge status={m.status} />}
      {canManage && active && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon" variant="ghost" className="size-8" aria-label={`${m.batch_name} actions`}>
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onSelect={() => {
                setRoll(m.roll_number ?? "");
                setEditingRoll(true);
              }}
            >
              Set roll number
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => {
                setEndedOn(todayInDhaka());
                setEnding(true);
              }}
            >
              End membership
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      <ConfirmDialog
        open={editingRoll}
        onOpenChange={setEditingRoll}
        title={`Roll number in ${m.batch_name}`}
        description="Optional; unique among the batch's current students."
        confirmLabel="Save"
        onConfirm={async () => {
          await studentsApi.setRoll(m.id, roll.trim() || null);
          await onChanged();
        }}
      >
        <FormField id={`roll-${m.id}`} label="Roll number">
          <Input id={`roll-${m.id}`} maxLength={10} value={roll} onChange={(e) => setRoll(e.target.value)} />
        </FormField>
      </ConfirmDialog>
      <ConfirmDialog
        open={ending}
        onOpenChange={setEnding}
        title={`End ${m.batch_name}?`}
        description="The student's overall status doesn't change. To rejoin later, add the batch again."
        confirmLabel="End membership"
        destructive
        onConfirm={async () => {
          await studentsApi.endMembership(m.id, { status: endStatus, ended_on: endedOn });
          await onChanged();
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id={`end-status-${m.id}`} label="Ended as">
            <Select value={endStatus} onValueChange={(v) => setEndStatus(v as "COMPLETED" | "LEFT")}>
              <SelectTrigger id={`end-status-${m.id}`} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="COMPLETED">Completed</SelectItem>
                <SelectItem value="LEFT">Left</SelectItem>
              </SelectContent>
            </Select>
          </FormField>
          <FormField id={`end-date-${m.id}`} label="Last day">
            <Input id={`end-date-${m.id}`} type="date" value={endedOn} onChange={(e) => setEndedOn(e.target.value)} />
          </FormField>
        </div>
      </ConfirmDialog>
    </li>
  );
}

function EditStudentDialog({ open, onOpenChange, student, withContacts, onSaved }: { open: boolean; onOpenChange: (open: boolean) => void; student: StudentDetail; withContacts: boolean; onSaved: () => Promise<unknown> }) {
  const [values, setValues] = useState<StudentFormValues>(() => studentFormFrom(student));
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const ok = await runAction(
      async () => {
        await studentsApi.update(student.id, studentFieldsFrom(values, withContacts));
        await onSaved();
      },
      { success: "Details saved." },
    );
    setSaving(false);
    if (ok) onOpenChange(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) setValues(studentFormFrom(student));
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit {student.full_name}</DialogTitle>
          <DialogDescription>The student ID, admission date and admission course can&apos;t change.</DialogDescription>
        </DialogHeader>
        <StudentFieldsForm values={values} onChange={(patch) => setValues((v) => ({ ...v, ...patch }))} withContacts={withContacts} />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving || studentFormMissing(values, withContacts)}>
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StatusDialog({ open, onOpenChange, student, onSaved }: { open: boolean; onOpenChange: (open: boolean) => void; student: StudentDetail; onSaved: () => Promise<unknown> }) {
  const options = NEXT[student.status];
  const [to, setTo] = useState<StudentStatus>(options[0]);
  const [reason, setReason] = useState("");
  const reasonRequired = to === "LEFT" || student.status === "COMPLETED" || student.status === "LEFT";

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setTo(options[0]);
          setReason("");
        }
        onOpenChange(next);
      }}
      title={`Change ${student.full_name}'s status`}
      description={STATUS_EFFECT[to]}
      confirmLabel="Change status"
      confirmDisabled={reasonRequired && !reason.trim()}
      destructive={to === "LEFT"}
      onConfirm={async () => {
        await studentsApi.setStatus(student.id, to, reason.trim() || null);
        await onSaved();
      }}
    >
      <div className="space-y-4">
        <FormField id="status-to" label="New status">
          <Select value={to} onValueChange={(v) => setTo(v as StudentStatus)}>
            <SelectTrigger id="status-to" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {options.map((s) => (
                <SelectItem key={s} value={s}>
                  {STATUS_LABEL[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
        <FormField id="status-reason" required={reasonRequired} label="Reason">
          <Textarea id="status-reason" rows={2} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
        </FormField>
      </div>
    </ConfirmDialog>
  );
}

function JoinBatchDialog({ open, onOpenChange, student, onSaved }: { open: boolean; onOpenChange: (open: boolean) => void; student: StudentDetail; onSaved: () => Promise<unknown> }) {
  const batches = useQuery({ queryKey: instituteKeys.batches({ status: "ACTIVE" }), queryFn: () => academicApi.batches({ status: "ACTIVE" }), enabled: open });
  const [batchId, setBatchId] = useState("");
  const [startedOn, setStartedOn] = useState(todayInDhaka());
  const [roll, setRoll] = useState("");
  const inNow = new Set(student.memberships.filter((m) => m.status === "ACTIVE").map((m) => m.batch_id));
  const options = (batches.data ?? []).filter((b) => !inNow.has(b.id));

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setBatchId("");
          setStartedOn(todayInDhaka());
          setRoll("");
        }
        onOpenChange(next);
      }}
      title={`Add ${student.full_name} to a batch`}
      description="A student can be in batches of more than one course."
      confirmLabel="Add to batch"
      confirmDisabled={!batchId || !startedOn}
      onConfirm={async () => {
        await studentsApi.join(student.id, { batch_id: batchId, started_on: startedOn, roll_number: roll.trim() || null });
        await onSaved();
      }}
    >
      <div className="space-y-4">
        <FormField id="join-batch" required label="Batch">
          <Select value={batchId} onValueChange={setBatchId}>
            <SelectTrigger id="join-batch" className="w-full">
              <SelectValue placeholder={options.length ? "Choose a batch" : "No other active batches"} />
            </SelectTrigger>
            <SelectContent>
              {options.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.name} · {b.course_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="join-date" required label="Joined on">
            <Input id="join-date" type="date" value={startedOn} onChange={(e) => setStartedOn(e.target.value)} />
          </FormField>
          <FormField id="join-roll" label="Roll number">
            <Input id="join-roll" maxLength={10} value={roll} onChange={(e) => setRoll(e.target.value)} />
          </FormField>
        </div>
      </div>
    </ConfirmDialog>
  );
}
