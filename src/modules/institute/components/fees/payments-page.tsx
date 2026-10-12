"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Printer, Receipt } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { FormField } from "@/components/shared/form-field";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState, ErrorState, LoadingState } from "@/components/shared/states";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { todayInDhaka } from "@/lib/dates";
import { notifySuccess } from "@/lib/feedback";
import { formatAmount, formatDate } from "@/lib/format";
import { HowThisWorks } from "@/modules/institute/help/how-this-works";
import { METHOD_LABEL, paymentListApi, paymentsApi, receiptUrl, type PaymentListRow } from "../../api";
import { instituteKeys } from "../../keys";
import type { FeesNav } from "./fees-nav";
import { FeesTabs } from "./fees-tabs";

const STATUS_FILTERS = [
  { value: "", label: "All" },
  { value: "VALID", label: "Valid" },
  { value: "VOID", label: "Void" },
] as const;

/** Every receipt in a date range (D99): reprint any of them, and void one with a reason (Owner/Admin, D35). */
export function PaymentsPage({ nav, canVoid }: { nav: FeesNav; canVoid: boolean }) {
  const queryClient = useQueryClient();
  const today = todayInDhaka();
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [status, setStatus] = useState<"" | "VALID" | "VOID">("");
  const q = { from, to, ...(status ? { status } : {}) };
  const list = useQuery({ queryKey: instituteKeys.payments(q), queryFn: () => paymentListApi.list(q), enabled: !!from && !!to });
  const [voiding, setVoiding] = useState<PaymentListRow | null>(null);
  const [reason, setReason] = useState("");

  return (
    <>
      <PageHeader title="Fees" description="Every receipt in the dates you choose." />
      <FeesTabs nav={nav} />
      <HowThisWorks topic="fees-counter" />
      <div className="flex flex-wrap items-end gap-3">
        <FormField id="payments-from" label="From">
          <Input id="payments-from" type="date" className="w-auto" value={from} onChange={(e) => setFrom(e.target.value)} />
        </FormField>
        <FormField id="payments-to" label="To">
          <Input id="payments-to" type="date" className="w-auto" value={to} onChange={(e) => setTo(e.target.value)} />
        </FormField>
        <div className="flex gap-1" role="group" aria-label="Status">
          {STATUS_FILTERS.map((f) => (
            <Button key={f.label} size="sm" variant={status === f.value ? "default" : "outline"} aria-pressed={status === f.value} onClick={() => setStatus(f.value)}>
              {f.label}
            </Button>
          ))}
        </div>
      </div>

      {list.isPending ? (
        <LoadingState rows={4} />
      ) : list.error ? (
        <ErrorState message={list.error.message} onRetry={() => list.refetch()} />
      ) : list.data.payments.length === 0 ? (
        <EmptyState icon={Receipt} title="No receipts in these dates" description="Payments recorded on the Collect page or a student's fees page appear here." />
      ) : (
        <>
          <p className="text-sm" data-testid="payments-total">
            {list.data.count} valid {list.data.count === 1 ? "receipt" : "receipts"} · <span className="font-mono font-semibold">{formatAmount(list.data.total)}</span>
            <span className="text-muted-foreground"> (voided receipts aren&apos;t counted)</span>
          </p>
          <div className="overflow-x-auto rounded-lg border" data-testid="payments-list">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Receipt</TableHead>
                  <TableHead>Student</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.data.payments.map((p) => (
                  <TableRow key={p.id} data-testid={`payment-${p.receipt_label}`}>
                    <TableCell className="whitespace-nowrap">{formatDate(p.paid_on)}</TableCell>
                    <TableCell className="font-mono">{p.receipt_label}</TableCell>
                    <TableCell>
                      <Link href={`/app/fees/students/${p.student_id}`} className="hover:underline">
                        {p.student_name}
                      </Link>{" "}
                      <span className="text-muted-foreground">{p.student_code}</span>
                      {p.received_by_name && <span className="block text-xs text-muted-foreground">Received by {p.received_by_name}</span>}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {METHOD_LABEL[p.method]}
                      {p.reference && <span className="block text-xs text-muted-foreground">{p.reference}</span>}
                    </TableCell>
                    <TableCell className="text-right font-mono">{formatAmount(p.amount)}</TableCell>
                    <TableCell>
                      <StatusBadge status={p.status} />
                      {p.void_reason && <span className="block text-xs text-muted-foreground">{p.void_reason}</span>}
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      <Button variant="ghost" size="sm" asChild>
                        <a href={receiptUrl(p.id)} target="_blank" rel="noreferrer">
                          <Printer /> Print
                        </a>
                      </Button>
                      {canVoid && p.status === "VALID" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={p.refunds > 0}
                          title={p.refunds > 0 ? "This payment has refunds recorded, so it can't be voided." : undefined}
                          onClick={() => {
                            setReason("");
                            setVoiding(p);
                          }}
                        >
                          Void
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}

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
          notifySuccess(`Receipt ${voiding!.receipt_label} voided.`);
          await queryClient.invalidateQueries({ queryKey: ["institute-payments"] });
        }}
      >
        <FormField id="payments-void-reason" required label="Reason">
          <Textarea id="payments-void-reason" rows={2} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />
        </FormField>
      </ConfirmDialog>
    </>
  );
}
