"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { FormField } from "@/components/shared/form-field";
import { PageHeader } from "@/components/shared/page-header";
import { ErrorState, LoadingState } from "@/components/shared/states";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { todayInDhaka } from "@/lib/dates";
import { notifySuccess, runAction } from "@/lib/feedback";
import { HowThisWorks } from "@/modules/institute/help/how-this-works";
import { leaveApi, type LeaveRow } from "../../api";
import { instituteKeys } from "../../keys";
import { leaveDates } from "../attendance/leave-page";

const STATUS_LABEL: Partial<Record<LeaveRow["status"], string>> = { PENDING: "Waiting for a decision" };

/** The student's own leave (D89, D92, D93): apply for up to 7 days back or any future date, see decisions, withdraw. */
export function MyLeavePage() {
  const queryClient = useQueryClient();
  const mine = useQuery({ queryKey: instituteKeys.myLeave(), queryFn: () => leaveApi.mine() });
  const [form, setForm] = useState({ from: todayInDhaka(), to: todayInDhaka(), reason: "" });
  const [saving, setSaving] = useState(false);
  const [withdrawing, setWithdrawing] = useState<LeaveRow | null>(null);
  const refresh = () => queryClient.invalidateQueries({ queryKey: instituteKeys.myLeave() });

  async function apply() {
    setSaving(true);
    const ok = await runAction(async () => {
      await leaveApi.apply({ from_date: form.from, to_date: form.to, reason: form.reason.trim() });
      notifySuccess("Leave application sent. The office will decide on it.");
      await refresh();
    });
    if (ok) setForm({ from: todayInDhaka(), to: todayInDhaka(), reason: "" });
    setSaving(false);
  }

  return (
    <>
      <PageHeader title="Leave" description="Apply for leave and see the office's decisions." />
      <HowThisWorks topic="leave-student" fullGuide={false} />
      <div className="grid gap-4 lg:grid-cols-[2fr_3fr]">
        <Card>
          <CardHeader>
            <CardTitle>Apply for leave</CardTitle>
            <CardDescription>For days you&apos;ll miss, or missed in the last 7 days.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <FormField id="my-leave-from" required label="First day">
                <Input id="my-leave-from" type="date" value={form.from} onChange={(e) => setForm({ ...form, from: e.target.value })} />
              </FormField>
              <FormField id="my-leave-to" required label="Last day">
                <Input id="my-leave-to" type="date" value={form.to} onChange={(e) => setForm({ ...form, to: e.target.value })} />
              </FormField>
            </div>
            <FormField id="my-leave-reason" required label="Reason">
              <Textarea id="my-leave-reason" rows={3} maxLength={300} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
            </FormField>
            <Button onClick={apply} disabled={saving || !form.from || !form.to || !form.reason.trim()}>
              {saving && <Loader2 className="animate-spin" />}
              Apply
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>My applications</CardTitle>
          </CardHeader>
          <CardContent>
            {mine.isPending ? (
              <LoadingState rows={3} />
            ) : mine.error ? (
              <ErrorState message={mine.error.message} onRetry={() => mine.refetch()} />
            ) : mine.data.length === 0 ? (
              <p className="text-sm text-muted-foreground">You haven&apos;t applied for leave yet.</p>
            ) : (
              <ul className="divide-y rounded-md border" data-testid="my-leave">
                {mine.data.map((l) => (
                  <li key={l.id} className="flex flex-wrap items-start gap-3 px-3 py-2.5 text-sm">
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <p className="font-medium">{leaveDates(l)}</p>
                      <p className="text-muted-foreground">{l.reason}</p>
                      {l.source === "OFFICE" && <p className="text-xs text-muted-foreground">Entered by the office</p>}
                      {l.decision_note && <p className="text-xs">Note from the office: {l.decision_note}</p>}
                      {l.revoke_reason && <p className="text-xs">Revoked: {l.revoke_reason}</p>}
                    </div>
                    <StatusBadge status={l.status} label={STATUS_LABEL[l.status]} />
                    {l.status === "PENDING" && (
                      <Button size="sm" variant="outline" onClick={() => setWithdrawing(l)}>
                        Withdraw
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
      <ConfirmDialog
        open={withdrawing !== null}
        onOpenChange={(o) => !o && setWithdrawing(null)}
        title="Withdraw this application?"
        description="The office won't decide on it any more. You can apply again later."
        confirmLabel="Withdraw"
        onConfirm={async () => {
          await leaveApi.withdraw(withdrawing!.id);
          notifySuccess("Application withdrawn.");
          await refresh();
        }}
      />
    </>
  );
}
