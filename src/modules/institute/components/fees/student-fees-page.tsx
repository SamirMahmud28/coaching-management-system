"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { FormField } from "@/components/shared/form-field";
import { PageHeader } from "@/components/shared/page-header";
import { ErrorState, LoadingState } from "@/components/shared/states";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { todayInDhaka } from "@/lib/dates";
import { formatAmount, formatDate } from "@/lib/format";
import { fromPoisha, sumPoisha, toPoisha } from "@/lib/money";
import { chargesApi, studentsApi, type ChargeRow } from "../../api";
import { instituteKeys } from "../../keys";

export interface StudentFeesPermissions {
  canViewStudent: boolean;
  canAdjust: boolean;
  canCancel: boolean;
}

/** One student's charges with their state; fines and cancellations here (F3), collection joins in F4. */
export function StudentFeesPage({ studentId, perms }: { studentId: string; perms: StudentFeesPermissions }) {
  const queryClient = useQueryClient();
  const student = useQuery({ queryKey: instituteKeys.student(studentId), queryFn: () => studentsApi.get(studentId), enabled: perms.canViewStudent });
  const charges = useQuery({ queryKey: instituteKeys.studentCharges(studentId), queryFn: () => chargesApi.studentCharges(studentId) });
  const [fining, setFining] = useState(false);
  const [fine, setFine] = useState({ amount: "", reason: "", dueDate: todayInDhaka() });
  const [cancelling, setCancelling] = useState<ChargeRow | null>(null);
  const [reason, setReason] = useState("");
  const refresh = () => queryClient.invalidateQueries({ queryKey: instituteKeys.studentCharges(studentId) });

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
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border p-4">
          <p className="text-2xl font-semibold tabular-nums" data-testid="due-total">
            {formatAmount(dueTotal)}
          </p>
          <p className="text-sm text-muted-foreground">Due now ({due.length} {due.length === 1 ? "charge" : "charges"})</p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-2xl font-semibold tabular-nums">{overdue}</p>
          <p className="text-sm text-muted-foreground">Overdue</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Charges</CardTitle>
          {perms.canAdjust && (
            <CardAction>
              <Button size="sm" variant="outline" onClick={() => setFining(true)}>
                <Plus /> Add fine
              </Button>
            </CardAction>
          )}
        </CardHeader>
        <CardContent>
          {charges.data.length === 0 ? (
            <p className="text-sm text-muted-foreground">No charges yet.</p>
          ) : (
            <ul className="divide-y rounded-md border text-sm" data-testid="charges">
              {charges.data.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">
                      {c.title}
                      {c.course_name && <span className="font-normal text-muted-foreground"> · {c.course_name}</span>}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Due {formatDate(c.due_date)}
                      {c.note && ` · ${c.note}`}
                      {c.paid_by && ` · paid ${formatDate(c.paid_by.paid_on)}, receipt ${c.paid_by.receipt_label}`}
                      {c.cancel_reason && ` · cancelled: ${c.cancel_reason}`}
                    </p>
                  </div>
                  <span className="font-mono">{formatAmount(c.net)}</span>
                  <StatusBadge status={c.overdue ? "OVERDUE" : c.state} />
                  {perms.canCancel && (c.state === "DUE" || c.state === "WAIVED") && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setReason("");
                        setCancelling(c);
                      }}
                    >
                      Cancel
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={fining}
        onOpenChange={(open) => {
          setFining(open);
          if (open) setFine({ amount: "", reason: "", dueDate: todayInDhaka() });
        }}
        title="Add a fine"
        description="A manual charge with a reason (no automatic late fines)."
        confirmLabel="Add fine"
        confirmDisabled={!fine.amount.trim() || !fine.reason.trim()}
        onConfirm={async () => {
          await chargesApi.addFine(studentId, { amount: fine.amount.trim(), reason: fine.reason.trim(), due_date: fine.dueDate || null });
          await refresh();
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="fine-amount" required label="Amount (৳)">
            <Input id="fine-amount" inputMode="decimal" value={fine.amount} onChange={(e) => setFine({ ...fine, amount: e.target.value })} />
          </FormField>
          <FormField id="fine-due" required label="Due on">
            <Input id="fine-due" type="date" value={fine.dueDate} onChange={(e) => setFine({ ...fine, dueDate: e.target.value })} />
          </FormField>
          <FormField id="fine-reason" required label="Reason" className="sm:col-span-2">
            <Textarea id="fine-reason" rows={2} maxLength={300} value={fine.reason} onChange={(e) => setFine({ ...fine, reason: e.target.value })} />
          </FormField>
        </div>
      </ConfirmDialog>
      <ConfirmDialog
        open={cancelling !== null}
        onOpenChange={(open) => !open && setCancelling(null)}
        title={cancelling ? `Cancel ${cancelling.title}?` : ""}
        description="It stays on record as cancelled, with your reason."
        confirmLabel="Cancel charge"
        destructive
        confirmDisabled={!reason.trim()}
        onConfirm={async () => {
          await chargesApi.cancelCharge(cancelling!.id, reason.trim());
          await refresh();
        }}
      >
        <FormField id="charge-cancel-reason" required label="Reason">
          <Textarea id="charge-cancel-reason" rows={2} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />
        </FormField>
      </ConfirmDialog>
    </>
  );
}
