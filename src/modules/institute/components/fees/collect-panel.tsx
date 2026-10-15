"use client";

import { Plus, X } from "lucide-react";
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
import { fromPoisha, isAmountText, percentOf, sumPoisha, toPoisha } from "@/lib/money";
import { METHOD_LABEL, PAYMENT_METHODS, paymentsApi, receiptUrl, type ChargeRow, type PaymentMethod } from "../../api";

interface WaiverDraft {
  chargeId: string;
  kind: "FIXED" | "PERCENT";
  value: string;
  reason: string;
}
interface FineDraft {
  amount: string;
  reason: string;
}

const validAmount = (v: string) => isAmountText(v.trim()) && toPoisha(v.trim()) > 0;

/**
 * Records money received for whole due charges. The total is the ticked charges' remaining amounts — there is no
 * amount box, so nothing is part-paid or overpaid. Waivers on ticked charges and new fines can be added in the
 * same step and are saved with the payment, or not at all. A fresh idempotency key per form makes a double click
 * harmless.
 */
export function CollectPanel({
  studentId,
  due,
  onRecorded,
  canWaive = false,
  canFine = false,
}: {
  studentId: string;
  due: ChargeRow[];
  onRecorded: () => Promise<unknown>;
  canWaive?: boolean;
  canFine?: boolean;
}) {
  const oldestFirst = [...due].sort((a, b) => a.due_date.localeCompare(b.due_date));
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [method, setMethod] = useState<PaymentMethod>("CASH");
  const [reference, setReference] = useState("");
  const [paidOn, setPaidOn] = useState(todayInDhaka());
  const [remarks, setRemarks] = useState("");
  const [waivers, setWaivers] = useState<WaiverDraft[]>([]);
  const [fines, setFines] = useState<FineDraft[]>([]);
  const [key, setKey] = useState(() => crypto.randomUUID());
  const [saving, setSaving] = useState(false);
  const [lastReceipt, setLastReceipt] = useState<{ id: string; label: string } | null>(null);
  const chosen = oldestFirst.filter((c) => ticked.has(c.id));
  const needsReference = method !== "CASH";

  // What each ticked charge still owes after the waivers being added; the server works it out again on save.
  const offOf = (w: WaiverDraft) => {
    const charge = chosen.find((c) => c.id === w.chargeId);
    if (!charge || !validAmount(w.value)) return 0;
    return w.kind === "FIXED" ? toPoisha(w.value.trim()) : percentOf(toPoisha(charge.amount), w.value.trim());
  };
  const owing = chosen.map((c) => Math.max(0, toPoisha(c.net) - sumPoisha(waivers.filter((w) => w.chargeId === c.id).map(offOf))));
  const fineTotal = sumPoisha(fines.filter((f) => validAmount(f.amount)).map((f) => toPoisha(f.amount.trim())));
  const total = fromPoisha(sumPoisha(owing) + fineTotal);
  const waiversReady = waivers.every((w) => chosen.some((c) => c.id === w.chargeId) && validAmount(w.value) && w.reason.trim());
  const finesReady = fines.every((f) => validAmount(f.amount) && f.reason.trim());

  async function record() {
    setSaving(true);
    const ok = await runAction(async () => {
      const payment = await paymentsApi.collect(studentId, {
        charge_ids: chosen.map((c) => c.id), paid_on: paidOn, method, reference: reference.trim() || null, remarks: remarks.trim() || null, idempotency_key: key,
        ...(waivers.length ? { waivers: waivers.map((w) => ({ charge_id: w.chargeId, kind: w.kind, value: w.value.trim(), reason: w.reason.trim() })) } : {}),
        ...(fines.length ? { fines: fines.map((f) => ({ amount: f.amount.trim(), reason: f.reason.trim() })) } : {}),
      });
      notifySuccess(`Payment recorded: receipt ${payment.receipt_label}, ${formatAmount(payment.amount)}.`);
      setLastReceipt({ id: payment.id, label: payment.receipt_label });
      await onRecorded();
    });
    if (ok) {
      setTicked(new Set());
      setReference("");
      setRemarks("");
      setWaivers([]);
      setFines([]);
      setKey(crypto.randomUUID());
    }
    setSaving(false);
  }

  const setWaiver = (i: number, patch: Partial<WaiverDraft>) => setWaivers(waivers.map((w, j) => (j === i ? { ...w, ...patch } : w)));
  const setFine = (i: number, patch: Partial<FineDraft>) => setFines(fines.map((f, j) => (j === i ? { ...f, ...patch } : f)));

  return (
    <Card data-testid="collect">
      <CardHeader>
        <CardTitle>Collect payment</CardTitle>
        <CardDescription>
          Tick the charges being paid. Each is paid in full; the total follows from them.
          {(canWaive || canFine) && " Waivers and fines added here are saved together with the payment."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {lastReceipt && (
          <p className="bg-card/50 rounded-md border border-dashed p-3 text-sm" role="status">
            Receipt <span className="font-mono">{lastReceipt.label}</span> recorded.{" "}
            <a href={receiptUrl(lastReceipt.id)} target="_blank" rel="noreferrer" className="font-medium underline">
              Print receipt
            </a>
          </p>
        )}
        {oldestFirst.length === 0 && <p className="text-sm text-muted-foreground">Nothing is due.{canFine && " You can still collect a fine."}</p>}
        {(oldestFirst.length > 0 || canFine) && (
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

            {(waivers.length > 0 || fines.length > 0) && (
              <div className="surface-glass-item space-y-3 rounded-md border p-3 text-sm" data-testid="collect-adjustments">
                {waivers.map((w, i) => (
                  <div key={`w${i}`} className="grid gap-2 sm:grid-cols-[2fr_1fr_1fr_2fr_auto] sm:items-end">
                    <FormField id={`waiver-charge-${i}`} label="Waive on">
                      <Select value={w.chargeId} onValueChange={(v) => setWaiver(i, { chargeId: v })}>
                        <SelectTrigger id={`waiver-charge-${i}`} className="w-full">
                          <SelectValue placeholder="Ticked charge" />
                        </SelectTrigger>
                        <SelectContent>
                          {chosen.map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.title}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormField>
                    <FormField id={`waiver-kind-${i}`} label="As">
                      <Select value={w.kind} onValueChange={(v) => setWaiver(i, { kind: v as WaiverDraft["kind"] })}>
                        <SelectTrigger id={`waiver-kind-${i}`} className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="FIXED">Amount (৳)</SelectItem>
                          <SelectItem value="PERCENT">Percent</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormField>
                    <FormField id={`waiver-value-${i}`} label={w.kind === "PERCENT" ? "Percent" : "Amount"}>
                      <Input id={`waiver-value-${i}`} inputMode="decimal" value={w.value} onChange={(e) => setWaiver(i, { value: e.target.value })} />
                    </FormField>
                    <FormField id={`waiver-reason-${i}`} label="Waiver reason">
                      <Input id={`waiver-reason-${i}`} maxLength={300} value={w.reason} onChange={(e) => setWaiver(i, { reason: e.target.value })} />
                    </FormField>
                    <Button variant="ghost" size="icon" aria-label="Remove waiver" onClick={() => setWaivers(waivers.filter((_, j) => j !== i))}>
                      <X />
                    </Button>
                  </div>
                ))}
                {fines.map((f, i) => (
                  <div key={`f${i}`} className="grid gap-2 sm:grid-cols-[1fr_3fr_auto] sm:items-end">
                    <FormField id={`fine-amount-${i}`} label="Fine (৳)">
                      <Input id={`fine-amount-${i}`} inputMode="decimal" value={f.amount} onChange={(e) => setFine(i, { amount: e.target.value })} />
                    </FormField>
                    <FormField id={`fine-reason-${i}`} label="Fine reason">
                      <Input id={`fine-reason-${i}`} maxLength={300} value={f.reason} onChange={(e) => setFine(i, { reason: e.target.value })} />
                    </FormField>
                    <Button variant="ghost" size="icon" aria-label="Remove fine" onClick={() => setFines(fines.filter((_, j) => j !== i))}>
                      <X />
                    </Button>
                  </div>
                ))}
              </div>
            )}
            {(canWaive || canFine) && (
              <div className="flex flex-wrap gap-2">
                {canWaive && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={chosen.length === 0}
                    title={chosen.length === 0 ? "Tick a charge first" : undefined}
                    onClick={() => setWaivers([...waivers, { chargeId: chosen.length === 1 ? chosen[0].id : "", kind: "FIXED", value: "", reason: "" }])}
                  >
                    <Plus /> Add waiver to payment
                  </Button>
                )}
                {canFine && (
                  <Button variant="outline" size="sm" onClick={() => setFines([...fines, { amount: "", reason: "" }])}>
                    <Plus /> Add fine to payment
                  </Button>
                )}
              </div>
            )}

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
              <Button onClick={record} disabled={saving || (chosen.length === 0 && fines.length === 0) || !paidOn || (needsReference && !reference.trim()) || !waiversReady || !finesReady}>
                Record payment
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
