import { StatusBadge } from "@/components/shared/status-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatAmount, formatDate } from "@/lib/format";
import { toPoisha } from "@/lib/money";
import type { myFees } from "@/server/modules/fees/ledger";

type MyFees = Awaited<ReturnType<typeof myFees>>;
type Item = MyFees["due"][number];

function Details({ c }: { c: Item }) {
  const bits = [c.courseName, c.reason, toPoisha(c.waived) > 0 ? `${formatAmount(c.waived)} waived` : null, toPoisha(c.refunded) > 0 ? `${formatAmount(c.refunded)} refunded` : null].filter(Boolean);
  return bits.length ? <p className="text-xs text-muted-foreground">{bits.join(" · ")}</p> : null;
}

/** The student's own fees: what they owe, overdue first, and what they paid with receipts to reprint. */
export function MyFeesCard({ fees }: { fees: MyFees }) {
  return (
    <Card data-testid="my-fees">
      <CardHeader>
        <CardTitle>My fees</CardTitle>
        <CardDescription>
          Due now: <span className="font-mono font-semibold text-foreground" data-testid="my-due-total">{formatAmount(fees.totalDue)}</span>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5 text-sm">
        <section className="space-y-2">
          <h3 className="font-medium">To pay</h3>
          {fees.due.length === 0 ? (
            <p className="text-muted-foreground">Nothing is due.</p>
          ) : (
            <ul className="surface-glass-dense divide-y rounded-md border">
              {fees.due.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{c.title}</p>
                    <Details c={c} />
                    <p className="text-xs text-muted-foreground">Due {formatDate(c.dueDate)}</p>
                  </div>
                  <span className="font-mono">{formatAmount(c.net)}</span>
                  <StatusBadge status={c.overdue ? "OVERDUE" : "DUE"} />
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="space-y-2">
          <h3 className="font-medium">Paid</h3>
          {fees.paid.length === 0 ? (
            <p className="text-muted-foreground">No payments yet.</p>
          ) : (
            <ul className="surface-glass-dense divide-y rounded-md border">
              {fees.paid.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{c.title}</p>
                    <Details c={c} />
                    <p className="text-xs text-muted-foreground">
                      Paid {formatDate(c.receipt!.paidOn)} · receipt <span className="font-mono">{c.receipt!.receiptLabel}</span>
                    </p>
                  </div>
                  <span className="font-mono">{formatAmount(c.net)}</span>
                  <a href={`/app/print/fee-receipt?payment=${c.receipt!.paymentId}`} target="_blank" rel="noreferrer" className="text-sm font-medium underline">
                    Receipt
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>
      </CardContent>
    </Card>
  );
}
