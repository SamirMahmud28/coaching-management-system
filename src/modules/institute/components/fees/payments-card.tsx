"use client";

import { useState } from "react";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { FormField } from "@/components/shared/form-field";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { formatAmount, formatDate } from "@/lib/format";
import { METHOD_LABEL, paymentsApi, receiptUrl, type PaymentRow } from "../../api";

/** A student's payments: print or reprint each receipt (never a new record), and void one with a reason (D35). */
export function PaymentsCard({ payments, canVoid, onChanged }: { payments: PaymentRow[]; canVoid: boolean; onChanged: () => Promise<unknown> }) {
  const [voiding, setVoiding] = useState<PaymentRow | null>(null);
  const [reason, setReason] = useState("");
  return (
    <Card>
      <CardHeader>
        <CardTitle>Payments</CardTitle>
      </CardHeader>
      <CardContent>
        {payments.length === 0 ? (
          <p className="text-sm text-muted-foreground">No payments yet.</p>
        ) : (
          <ul className="divide-y rounded-md border text-sm" data-testid="payments">
            {payments.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    <span className="font-mono">{p.receipt_label}</span> · {formatDate(p.paid_on)} · {METHOD_LABEL[p.method]}
                    {p.reference && <span className="font-normal text-muted-foreground"> ({p.reference})</span>}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {p.lines.map((l) => l.title).join(", ")}
                    {p.received_by_name && ` · received by ${p.received_by_name}`}
                    {p.void_reason && ` · void: ${p.void_reason}`}
                    {p.refunds?.length ? ` · refunded ${p.refunds.map((r) => formatAmount(r.amount)).join(" + ")}` : ""}
                  </p>
                </div>
                <span className="font-mono">{formatAmount(p.amount)}</span>
                <StatusBadge status={p.status} />
                <Button size="sm" variant="ghost" asChild>
                  <a href={receiptUrl(p.id)} target="_blank" rel="noreferrer">
                    Print
                  </a>
                </Button>
                {canVoid && p.status === "VALID" && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setReason("");
                      setVoiding(p);
                    }}
                  >
                    Void
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
      <ConfirmDialog
        open={voiding !== null}
        onOpenChange={(open) => !open && setVoiding(null)}
        title={voiding ? `Void receipt ${voiding.receipt_label}?` : ""}
        description="The receipt is marked VOID and its number is never reused; its charges become due again. Record the correct payment afterwards."
        confirmLabel="Void payment"
        destructive
        confirmDisabled={!reason.trim()}
        onConfirm={async () => {
          await paymentsApi.void(voiding!.id, reason.trim());
          await onChanged();
        }}
      >
        <FormField id="void-reason" required label="Reason">
          <Textarea id="void-reason" rows={2} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />
        </FormField>
      </ConfirmDialog>
    </Card>
  );
}
