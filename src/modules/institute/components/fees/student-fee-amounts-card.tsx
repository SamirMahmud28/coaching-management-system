"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { FormField } from "@/components/shared/form-field";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { runAction } from "@/lib/feedback";
import { formatAmount } from "@/lib/format";
import { feesApi, type StudentFeeAmountRow } from "../../api";
import { instituteKeys } from "../../keys";

/** A student's own amounts for the fees of their current courses (D29); used by charges generated from now on. */
export function StudentFeeAmountsCard({ studentId, canAdjust }: { studentId: string; canAdjust: boolean }) {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: instituteKeys.studentFeeAmounts(studentId), queryFn: () => feesApi.studentAmounts(studentId) });
  const [editing, setEditing] = useState<StudentFeeAmountRow | null>(null);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const refresh = () => queryClient.invalidateQueries({ queryKey: instituteKeys.studentFeeAmounts(studentId) });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Fee amounts</CardTitle>
        <CardDescription>The fees of this student&apos;s current courses. A different amount applies to charges generated from now on.</CardDescription>
      </CardHeader>
      <CardContent>
        {query.isPending ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : !query.data?.length ? (
          <p className="text-sm text-muted-foreground">No fees for this student&apos;s current courses.</p>
        ) : (
          <ul className="divide-y rounded-md border" data-testid="fee-amounts">
            {query.data.map((f) => (
              <li key={f.fee_item_id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {f.name} <span className="font-normal text-muted-foreground">· {f.course_name}</span>
                  </p>
                  {f.amount !== null && <p className="text-xs text-muted-foreground">Own amount: {f.reason}</p>}
                </div>
                <span className="font-mono">
                  {f.amount !== null ? (
                    <>
                      <s className="text-muted-foreground">{formatAmount(f.course_amount)}</s> {formatAmount(f.amount)}
                    </>
                  ) : (
                    formatAmount(f.course_amount)
                  )}
                </span>
                {canAdjust && (
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setAmount(f.amount?.replace(/\.00$/, "") ?? "");
                        setReason(f.reason ?? "");
                        setEditing(f);
                      }}
                    >
                      {f.amount !== null ? "Change" : "Set own amount"}
                    </Button>
                    {f.id && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          runAction(
                            async () => {
                              await feesApi.removeStudentAmount(f.id!);
                              await refresh();
                            },
                            { success: "Back to the course amount." },
                          )
                        }
                      >
                        Use course amount
                      </Button>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
      <ConfirmDialog
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        title={editing ? `Own amount for ${editing.name}` : ""}
        description={editing ? `The course amount is ${formatAmount(editing.course_amount)}. 0 means the student isn't charged this fee.` : undefined}
        confirmLabel="Save"
        confirmDisabled={!amount.trim() || !reason.trim()}
        onConfirm={async () => {
          await feesApi.setStudentAmount(studentId, { fee_item_id: editing!.fee_item_id, amount: amount.trim(), reason: reason.trim() });
          await refresh();
        }}
      >
        <div className="space-y-4">
          <FormField id="own-amount" required label="Amount (৳)">
            <Input id="own-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </FormField>
          <FormField id="own-reason" required label="Reason">
            <Textarea id="own-reason" rows={2} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Sibling rate" />
          </FormField>
        </div>
      </ConfirmDialog>
    </Card>
  );
}
