"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, MoreHorizontal, Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { FormField } from "@/components/shared/form-field";
import { PageHeader } from "@/components/shared/page-header";
import { ErrorState, LoadingState } from "@/components/shared/states";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { todayInDhaka } from "@/lib/dates";
import { formatAmount, formatDate } from "@/lib/format";
import { fromPoisha, sumPoisha, toPoisha } from "@/lib/money";
import { METHOD_LABEL, PAYMENT_METHODS, chargesApi, paymentsApi, studentsApi, type ChargeRow, type PaymentMethod } from "../../api";
import { instituteKeys } from "../../keys";
import { CollectPanel } from "./collect-panel";
import { PaymentsCard } from "./payments-card";
import { HowThisWorks } from "@/modules/institute/help/how-this-works";

export interface StudentFeesPermissions {
  canViewStudent: boolean;
  canAdjust: boolean;
  canCancel: boolean;
  canCollect: boolean;
  canWaive: boolean;
  canVoid: boolean;
  canRefund: boolean;
}

type Dialog =
  | { kind: "fine" }
  | { kind: "cancel"; charge: ChargeRow }
  | { kind: "waive"; charge: ChargeRow }
  | { kind: "refund"; charge: ChargeRow }
  | null;

/** One student's fees: what's due, collecting it, receipts, and corrections (D31–D37, D43, D69–D74). */
export function StudentFeesPage({ studentId, perms }: { studentId: string; perms: StudentFeesPermissions }) {
  const queryClient = useQueryClient();
  const student = useQuery({ queryKey: instituteKeys.student(studentId), queryFn: () => studentsApi.get(studentId), enabled: perms.canViewStudent });
  const charges = useQuery({ queryKey: instituteKeys.studentCharges(studentId), queryFn: () => chargesApi.studentCharges(studentId) });
  const payments = useQuery({ queryKey: instituteKeys.studentPayments(studentId), queryFn: () => paymentsApi.list(studentId) });
  const [dialog, setDialog] = useState<Dialog>(null);
  const [form, setForm] = useState({ amount: "", reason: "", date: todayInDhaka(), kind: "FIXED" as "FIXED" | "PERCENT", method: "CASH" as PaymentMethod, reference: "" });
  const open = (d: NonNullable<Dialog>) => {
    setForm({ amount: "", reason: "", date: todayInDhaka(), kind: "FIXED", method: "CASH", reference: "" });
    setDialog(d);
  };
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: instituteKeys.studentCharges(studentId) }),
      queryClient.invalidateQueries({ queryKey: instituteKeys.studentPayments(studentId) }),
    ]);

  if (charges.isPending) return <LoadingState rows={5} />;
  if (charges.error) return <ErrorState message={charges.error.message} onRetry={() => charges.refetch()} />;
  const due = charges.data.filter((c) => c.state === "DUE");
  const dueTotal = fromPoisha(sumPoisha(due.map((c) => toPoisha(c.net))));
  const overdue = due.filter((c) => c.overdue).length;

  return (
    <>
      <Link href={`/app/students/${studentId}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Student profile
      </Link>
      <PageHeader
        title={student.data ? `${student.data.full_name} — fees` : "Student fees"}
        description={student.data ? <span className="font-mono">{student.data.student_code}</span> : undefined}
      />
      <HowThisWorks topic="fees-student" />
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="surface-glass-item rounded-lg border p-4">
          <p className="text-2xl font-semibold tabular-nums" data-testid="due-total">
            {formatAmount(dueTotal)}
          </p>
          <p className="text-sm text-muted-foreground">Due now ({due.length} {due.length === 1 ? "charge" : "charges"})</p>
        </div>
        <div className="surface-glass-item rounded-lg border p-4">
          <p className="text-2xl font-semibold tabular-nums">{overdue}</p>
          <p className="text-sm text-muted-foreground">Overdue</p>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {perms.canCollect && <CollectPanel studentId={studentId} due={due} onRecorded={refresh} canWaive={perms.canWaive} canFine={perms.canAdjust} />}
        <Card>
          <CardHeader>
            <CardTitle>Charges</CardTitle>
            {perms.canAdjust && (
              <CardAction>
                <Button size="sm" variant="outline" onClick={() => open({ kind: "fine" })}>
                  <Plus /> Add fine
                </Button>
              </CardAction>
            )}
          </CardHeader>
          <CardContent>
            {charges.data.length === 0 ? (
              <p className="text-sm text-muted-foreground">No charges yet.</p>
            ) : (
              <ul className="surface-glass-dense divide-y rounded-md border text-sm" data-testid="charges">
                {charges.data.map((c) => {
                  const actions = [
                    ...(perms.canWaive && c.state === "DUE" ? [{ label: "Waive", run: () => open({ kind: "waive", charge: c }) }] : []),
                    ...(perms.canRefund && c.state === "PAID" ? [{ label: "Refund", run: () => open({ kind: "refund", charge: c }) }] : []),
                    ...(perms.canCancel && (c.state === "DUE" || c.state === "WAIVED") ? [{ label: "Cancel", run: () => open({ kind: "cancel", charge: c }) }] : []),
                  ];
                  return (
                    <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">
                          {c.title}
                          {c.course_name && <span className="font-normal text-muted-foreground"> · {c.course_name}</span>}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Due {formatDate(c.due_date)}
                          {c.note && ` · ${c.note}`}
                          {toPoisha(c.waived) > 0 && ` · ${formatAmount(c.waived)} waived`}
                          {c.paid_by && ` · paid ${formatDate(c.paid_by.paid_on)}, receipt ${c.paid_by.receipt_label}`}
                          {toPoisha(c.refunded) > 0 && ` · ${formatAmount(c.refunded)} refunded`}
                          {c.cancel_reason && ` · cancelled: ${c.cancel_reason}`}
                        </p>
                      </div>
                      <span className="font-mono">{formatAmount(c.net)}</span>
                      <StatusBadge status={c.overdue ? "OVERDUE" : c.state} />
                      {actions.length > 0 && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="icon" variant="ghost" className="size-8" aria-label={`${c.title} actions`}>
                              <MoreHorizontal />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {actions.map((a) => (
                              <DropdownMenuItem key={a.label} onSelect={a.run}>
                                {a.label}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <PaymentsCard payments={payments.data ?? []} canVoid={perms.canVoid} onChanged={refresh} />

      <ConfirmDialog
        open={dialog?.kind === "fine"}
        onOpenChange={(o) => !o && setDialog(null)}
        title="Add a fine"
        description="A manual charge with a reason (no automatic late fines)."
        confirmLabel="Add fine"
        confirmDisabled={!form.amount.trim() || !form.reason.trim()}
        onConfirm={async () => {
          await chargesApi.addFine(studentId, { amount: form.amount.trim(), reason: form.reason.trim(), due_date: form.date || null });
          await refresh();
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="fine-amount" required label="Amount (৳)">
            <Input id="fine-amount" inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          </FormField>
          <FormField id="fine-due" required label="Due on">
            <Input id="fine-due" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          </FormField>
          <FormField id="fine-reason" required label="Reason" className="sm:col-span-2">
            <Textarea id="fine-reason" rows={2} maxLength={300} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
          </FormField>
        </div>
      </ConfirmDialog>

      <ConfirmDialog
        open={dialog?.kind === "cancel"}
        onOpenChange={(o) => !o && setDialog(null)}
        title={dialog?.kind === "cancel" ? `Cancel ${dialog.charge.title}?` : ""}
        description="It stays on record as cancelled, with your reason."
        confirmLabel="Cancel charge"
        destructive
        confirmDisabled={!form.reason.trim()}
        onConfirm={async () => {
          if (dialog?.kind !== "cancel") return;
          await chargesApi.cancelCharge(dialog.charge.id, form.reason.trim());
          await refresh();
        }}
      >
        <FormField id="charge-cancel-reason" required label="Reason">
          <Textarea id="charge-cancel-reason" rows={2} maxLength={300} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
        </FormField>
      </ConfirmDialog>

      <ConfirmDialog
        open={dialog?.kind === "waive"}
        onOpenChange={(o) => !o && setDialog(null)}
        title={dialog?.kind === "waive" ? `Waive part of ${dialog.charge.title}` : ""}
        description={dialog?.kind === "waive" ? `Still owed: ${formatAmount(dialog.charge.net)}. A waiver can't take it below zero.` : undefined}
        confirmLabel="Add waiver"
        confirmDisabled={!form.amount.trim() || !form.reason.trim()}
        onConfirm={async () => {
          if (dialog?.kind !== "waive") return;
          await paymentsApi.waive(dialog.charge.id, { kind: form.kind, value: form.amount.trim(), reason: form.reason.trim() });
          await refresh();
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="waive-kind" label="Waive by">
            <Select value={form.kind} onValueChange={(v) => setForm({ ...form, kind: v as "FIXED" | "PERCENT" })}>
              <SelectTrigger id="waive-kind" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="FIXED">Amount (৳)</SelectItem>
                <SelectItem value="PERCENT">Percent of the charge</SelectItem>
              </SelectContent>
            </Select>
          </FormField>
          <FormField id="waive-value" required label={form.kind === "FIXED" ? "Amount (৳)" : "Percent"}>
            <Input id="waive-value" inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          </FormField>
          <FormField id="waive-reason" required label="Reason" className="sm:col-span-2">
            <Textarea id="waive-reason" rows={2} maxLength={300} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
          </FormField>
        </div>
      </ConfirmDialog>

      <ConfirmDialog
        open={dialog?.kind === "refund"}
        onOpenChange={(o) => !o && setDialog(null)}
        title={dialog?.kind === "refund" ? `Refund ${dialog.charge.title}` : ""}
        description={
          dialog?.kind === "refund" && dialog.charge.paid_by
            ? `Paid ${formatAmount(dialog.charge.paid_by.amount)} (receipt ${dialog.charge.paid_by.receipt_label}); up to ${formatAmount(fromPoisha(toPoisha(dialog.charge.paid_by.amount) - toPoisha(dialog.charge.refunded)))} can be refunded. The charge stays settled.`
            : undefined
        }
        confirmLabel="Record refund"
        confirmDisabled={!form.amount.trim() || !form.reason.trim() || (form.method !== "CASH" && !form.reference.trim())}
        onConfirm={async () => {
          if (dialog?.kind !== "refund") return;
          await paymentsApi.refund(dialog.charge.id, { amount: form.amount.trim(), method: form.method, reference: form.reference.trim() || null, reason: form.reason.trim(), refunded_on: form.date });
          await refresh();
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="refund-amount" required label="Amount (৳)">
            <Input id="refund-amount" inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          </FormField>
          <FormField id="refund-date" required label="Refunded on">
            <Input id="refund-date" type="date" max={todayInDhaka()} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          </FormField>
          <FormField id="refund-method" required label="Method">
            <Select value={form.method} onValueChange={(v) => setForm({ ...form, method: v as PaymentMethod })}>
              <SelectTrigger id="refund-method" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_METHODS.map((m) => (
                  <SelectItem key={m} value={m}>
                    {METHOD_LABEL[m]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          <FormField id="refund-reference" required={form.method !== "CASH"} label="Reference">
            <Input id="refund-reference" maxLength={100} disabled={form.method === "CASH"} value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} />
          </FormField>
          <FormField id="refund-reason" required label="Reason" className="sm:col-span-2">
            <Textarea id="refund-reason" rows={2} maxLength={300} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
          </FormField>
        </div>
      </ConfirmDialog>
    </>
  );
}
