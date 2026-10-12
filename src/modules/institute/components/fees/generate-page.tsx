"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { FormField } from "@/components/shared/form-field";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { todayInDhaka } from "@/lib/dates";
import { notifySuccess, runAction } from "@/lib/feedback";
import { formatAmount, formatDate, formatDateTime } from "@/lib/format";
import { fromPoisha, isAmountText, sumPoisha, toPoisha } from "@/lib/money";
import { chargesApi, feesApi, type GenerationPreview, type GenerationRunRow, type SkipReason } from "../../api";
import { instituteKeys } from "../../keys";
import { KIND_LABEL } from "./fee-items-page";
import { FeesTabs } from "./fees-tabs";
import { HowThisWorks } from "@/modules/institute/help/how-this-works";

export const SKIP_LABEL: Record<SkipReason, string> = {
  ON_HOLD: "On hold",
  COMPLETED: "Completed",
  LEFT: "Left",
  NOT_IN_COURSE: "No longer in the course",
  JOINED_LATER: "Joined after this month",
  ALREADY_CHARGED: "Already charged",
  ZERO_AMOUNT: "Own amount is ৳0",
  EXCLUDED: "Left out by you",
};

/** Generate monthly or one-time charges from a preview (D30, D40, D62, D65, D67, D68). */
export function GeneratePage({ canReport }: { canReport: boolean }) {
  const queryClient = useQueryClient();
  const items = useQuery({ queryKey: instituteKeys.feeItems({ status: "ACTIVE" }), queryFn: () => feesApi.items({ status: "ACTIVE" }) });
  const [itemId, setItemId] = useState("");
  const [month, setMonth] = useState(todayInDhaka().slice(0, 7));
  const [preview, setPreview] = useState<GenerationPreview | null>(null);
  const [unticked, setUnticked] = useState<Set<string>>(new Set());
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const item = items.data?.find((i) => i.id === itemId);
  const monthly = item?.kind === "MONTHLY";

  async function loadPreview() {
    setBusy(true);
    await runAction(async () => {
      setPreview(await chargesApi.preview({ fee_item_id: itemId, period: monthly ? month : null }));
      setUnticked(new Set());
      setAmounts({});
    });
    setBusy(false);
  }

  const charging = (preview?.to_charge ?? []).filter((r) => !unticked.has(r.student_id));
  const amountOf = (r: GenerationPreview["to_charge"][number]) => amounts[r.student_id] ?? r.amount;
  const valid = charging.every((r) => isAmountText(amountOf(r)) && toPoisha(amountOf(r)) > 0 && toPoisha(amountOf(r)) <= toPoisha(r.amount));
  const total = valid ? fromPoisha(sumPoisha(charging.map((r) => toPoisha(amountOf(r))))) : null;

  async function confirm() {
    if (!preview) return;
    setBusy(true);
    await runAction(async () => {
      const run = await chargesApi.generate({
        fee_item_id: preview.fee_item.id,
        period: preview.period === "ONCE" ? null : preview.period,
        exclude: [...unticked],
        amounts: charging.filter((r) => amountOf(r) !== r.amount).map((r) => ({ student_id: r.student_id, amount: amountOf(r) })),
      });
      notifySuccess(`${run.created_count} ${run.created_count === 1 ? "charge" : "charges"} created, ${formatAmount(run.total)} in all, due ${formatDate(run.due_date)}.`);
      setPreview(null);
      await queryClient.invalidateQueries({ queryKey: instituteKeys.feeRuns() });
      await queryClient.invalidateQueries({ queryKey: ["institute-student-charges"] });
    });
    setBusy(false);
  }

  return (
    <>
      <PageHeader title="Fees" description="Charges are created only when you confirm a preview; nothing is charged automatically." />
      <HowThisWorks topic="fees-generate" />
      <FeesTabs canGenerate canReport={canReport} />
      <Card>
        <CardHeader>
          <CardTitle>Generate charges</CardTitle>
          <CardDescription>Monthly fees for a month (a future month too, for paying ahead), or a one-time fee once per student.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <FormField id="gen-item" label="Fee">
            <Select
              value={itemId}
              onValueChange={(v) => {
                setItemId(v);
                setPreview(null);
              }}
            >
              <SelectTrigger id="gen-item" className="w-72">
                <SelectValue placeholder="Choose a fee" />
              </SelectTrigger>
              <SelectContent>
                {(items.data ?? []).map((i) => (
                  <SelectItem key={i.id} value={i.id}>
                    {i.course_name} · {i.name} ({KIND_LABEL[i.kind]})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          {monthly && (
            <FormField id="gen-month" label="Month">
              <Input
                id="gen-month"
                type="month"
                className="w-44"
                value={month}
                onChange={(e) => {
                  setMonth(e.target.value);
                  setPreview(null);
                }}
              />
            </FormField>
          )}
          <Button variant="outline" disabled={!item || (monthly && !month) || busy} onClick={loadPreview}>
            Preview
          </Button>
        </CardContent>
      </Card>

      {preview && (
        <Card data-testid="generation-preview">
          <CardHeader>
            <CardTitle>
              {preview.fee_item.course_name} · {preview.fee_item.name} — {preview.period_label}
            </CardTitle>
            <CardDescription>
              Due {formatDate(preview.due_date)}. Untick anyone you don&apos;t want to charge now; amounts can only be lowered here.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {preview.to_charge.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nobody to charge.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground">
                    <th className="w-8 py-1" />
                    <th className="py-1 font-medium">Student</th>
                    <th className="py-1 text-right font-medium">Amount (৳)</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {preview.to_charge.map((r) => (
                    <tr key={r.student_id}>
                      <td className="py-1.5">
                        <Checkbox
                          aria-label={`Charge ${r.full_name}`}
                          checked={!unticked.has(r.student_id)}
                          onCheckedChange={(checked) =>
                            setUnticked((prev) => {
                              const next = new Set(prev);
                              if (checked) next.delete(r.student_id);
                              else next.add(r.student_id);
                              return next;
                            })
                          }
                        />
                      </td>
                      <td className="py-1.5">
                        {r.full_name} <span className="font-mono text-xs text-muted-foreground">{r.student_code}</span>
                        {r.own_amount && <span className="text-xs text-muted-foreground"> · own amount</span>}
                      </td>
                      <td className="py-1.5 text-right">
                        <Input
                          aria-label={`Amount for ${r.full_name}`}
                          className="ml-auto h-8 w-28 text-right font-mono"
                          inputMode="decimal"
                          disabled={unticked.has(r.student_id)}
                          value={amountOf(r).replace(/\.00$/, "")}
                          onChange={(e) => setAmounts((prev) => ({ ...prev, [r.student_id]: e.target.value }))}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {preview.skipped.length > 0 && (
              <div className="space-y-1 text-sm">
                <p className="font-medium">Skipped ({preview.skipped.length})</p>
                <ul className="text-muted-foreground">
                  {preview.skipped.map((r) => (
                    <li key={r.student_id}>
                      {r.full_name} <span className="font-mono text-xs">{r.student_code}</span> — {SKIP_LABEL[r.reason]}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
              <p className="text-sm">
                {charging.length} {charging.length === 1 ? "charge" : "charges"} · total{" "}
                <span className="font-mono font-semibold">{total ? formatAmount(total) : "—"}</span>
                {!valid && <span className="text-destructive"> · an amount is invalid or higher than the fee</span>}
              </p>
              <Button onClick={confirm} disabled={busy || charging.length === 0 || !valid}>
                Create {charging.length} {charging.length === 1 ? "charge" : "charges"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <RecentRuns />
    </>
  );
}

function RecentRuns() {
  const queryClient = useQueryClient();
  const runs = useQuery({ queryKey: instituteKeys.feeRuns(), queryFn: chargesApi.runs });
  const [cancelling, setCancelling] = useState<GenerationRunRow | null>(null);
  const [reason, setReason] = useState("");
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent generations</CardTitle>
      </CardHeader>
      <CardContent>
        {!runs.data?.length ? (
          <p className="text-sm text-muted-foreground">None yet.</p>
        ) : (
          <ul className="divide-y rounded-md border text-sm" data-testid="runs">
            {runs.data.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {r.course_name} · {r.fee_item_name} — {r.period === "ONCE" ? "one-time" : r.period}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatDateTime(r.created_at)} · {r.created_count} charged ({r.active_count} still active) · {formatAmount(r.total_amount)}
                  </p>
                </div>
                {r.active_count > 0 && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setReason("");
                      setCancelling(r);
                    }}
                  >
                    Cancel unpaid
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
      <ConfirmDialog
        open={cancelling !== null}
        onOpenChange={(open) => !open && setCancelling(null)}
        title="Cancel this generation's unpaid charges?"
        description="Paid charges are kept (void their payments first if they're wrong). Cancelled charges stay on record with your reason."
        confirmLabel="Cancel unpaid charges"
        destructive
        confirmDisabled={!reason.trim()}
        onConfirm={async () => {
          const result = await chargesApi.cancelRun(cancelling!.id, reason.trim());
          notifySuccess(`${result.cancelled} cancelled${result.kept_paid ? `, ${result.kept_paid} paid kept` : ""}.`);
          await queryClient.invalidateQueries({ queryKey: instituteKeys.feeRuns() });
          await queryClient.invalidateQueries({ queryKey: ["institute-student-charges"] });
        }}
      >
        <FormField id="run-cancel-reason" required label="Reason">
          <Textarea id="run-cancel-reason" rows={2} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />
        </FormField>
      </ConfirmDialog>
    </Card>
  );
}
