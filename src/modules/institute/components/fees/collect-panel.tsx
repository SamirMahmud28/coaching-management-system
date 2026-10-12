"use client";

import { useState } from "react";
import { FormField } from "@/components/shared/form-field";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { todayInDhaka } from "@/lib/dates";
import { notifySuccess, runAction } from "@/lib/feedback";
import { formatAmount, formatDate } from "@/lib/format";
import { fromPoisha, sumPoisha, toPoisha } from "@/lib/money";
import { METHOD_LABEL, PAYMENT_METHODS, paymentsApi, receiptUrl, type ChargeRow, type PaymentMethod } from "../../api";

/**
 * Records money received for whole due charges (D31). The total is the ticked charges' remaining amounts — there is no
 * amount box, so nothing is part-paid or overpaid (D32). A fresh idempotency key per form makes a double click harmless.
 */
export function CollectPanel({ studentId, due, onRecorded }: { studentId: string; due: ChargeRow[]; onRecorded: () => Promise<unknown> }) {
  const oldestFirst = [...due].sort((a, b) => a.due_date.localeCompare(b.due_date));
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [method, setMethod] = useState<PaymentMethod>("CASH");
  const [reference, setReference] = useState("");
  const [paidOn, setPaidOn] = useState(todayInDhaka());
  const [remarks, setRemarks] = useState("");
  const [key, setKey] = useState(() => crypto.randomUUID());
  const [saving, setSaving] = useState(false);
  const [lastReceipt, setLastReceipt] = useState<{ id: string; label: string } | null>(null);
  const chosen = oldestFirst.filter((c) => ticked.has(c.id));
  const total = fromPoisha(sumPoisha(chosen.map((c) => toPoisha(c.net))));
  const needsReference = method !== "CASH";

  async function record() {
    setSaving(true);
    const ok = await runAction(async () => {
      const payment = await paymentsApi.collect(studentId, {
        charge_ids: chosen.map((c) => c.id), paid_on: paidOn, method, reference: reference.trim() || null, remarks: remarks.trim() || null, idempotency_key: key,
      });
      notifySuccess(`Payment recorded: receipt ${payment.receipt_label}, ${formatAmount(payment.amount)}.`);
      setLastReceipt({ id: payment.id, label: payment.receipt_label });
      await onRecorded();
    });
    if (ok) {
      setTicked(new Set());
      setReference("");
      setRemarks("");
      setKey(crypto.randomUUID());
    }
    setSaving(false);
  }

  return (
    <Card data-testid="collect">
      <CardHeader>
        <CardTitle>Collect payment</CardTitle>
        <CardDescription>Tick the charges being paid. Each is paid in full; the total follows from them.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {lastReceipt && (
          <p className="rounded-md border border-dashed p-3 text-sm" role="status">
            Receipt <span className="font-mono">{lastReceipt.label}</span> recorded.{" "}
            <a href={receiptUrl(lastReceipt.id)} target="_blank" rel="noreferrer" className="font-medium underline">
              Print receipt
            </a>
          </p>
        )}
        {oldestFirst.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing is due.</p>
        ) : (
          <>
            <ul className="space-y-2 text-sm">
              {oldestFirst.map((c) => (
                <li key={c.id} className="flex items-center gap-2">
                  <Checkbox
                    id={`pay-${c.id}`}
                    checked={ticked.has(c.id)}
                    onCheckedChange={(checked) =>
                      setTicked((prev) => {
                        const next = new Set(prev);
                        if (checked) next.add(c.id);
                        else next.delete(c.id);
                        return next;
                      })
                    }
                  />
                  <Label htmlFor={`pay-${c.id}`} className="flex flex-1 justify-between gap-2 font-normal">
                    <span>
                      {c.title} <span className="text-muted-foreground">· due {formatDate(c.due_date)}</span>
                    </span>
                    <span className="font-mono">{formatAmount(c.net)}</span>
                  </Label>
                </li>
              ))}
            </ul>
            <div className="grid gap-4 sm:grid-cols-3">
              <FormField id="pay-method" required label="Method">
                <Select value={method} onValueChange={(v) => setMethod(v as PaymentMethod)}>
                  <SelectTrigger id="pay-method" className="w-full">
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
              <FormField id="pay-reference" required={needsReference} label="Reference" hint={needsReference ? "Transaction ID or cheque number." : "Not needed for cash."}>
                <Input id="pay-reference" maxLength={100} value={reference} onChange={(e) => setReference(e.target.value)} disabled={!needsReference} />
              </FormField>
              <FormField id="pay-date" required label="Received on">
                <Input id="pay-date" type="date" max={todayInDhaka()} value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />
              </FormField>
            </div>
            <FormField id="pay-remarks" label="Remarks">
              <Input id="pay-remarks" maxLength={500} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
            </FormField>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
              <p className="text-sm">
                Total <span className="font-mono text-base font-semibold" data-testid="collect-total">{formatAmount(total)}</span>
              </p>
              <Button onClick={record} disabled={saving || chosen.length === 0 || !paidOn || (needsReference && !reference.trim())}>
                Record payment
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
