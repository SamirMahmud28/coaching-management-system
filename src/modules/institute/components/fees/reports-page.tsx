"use client";

import { useQuery } from "@tanstack/react-query";
import { Printer } from "lucide-react";
import { useState } from "react";
import { FormField } from "@/components/shared/form-field";
import { PageHeader } from "@/components/shared/page-header";
import { ErrorState, LoadingState } from "@/components/shared/states";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { todayInDhaka } from "@/lib/dates";
import { formatAmount, formatDate } from "@/lib/format";
import { METHOD_LABEL, academicApi, reportPrintUrl, reportsApi, type FeeReportKind, type ReportFilters } from "../../api";
import { instituteKeys } from "../../keys";
import { FeesTabs } from "./fees-tabs";

const ALL = "all";
const REPORTS: { kind: FeeReportKind; label: string }[] = [
  { kind: "collections", label: "Collections" },
  { kind: "dues", label: "Dues" },
  { kind: "former-dues", label: "Former students' dues" },
  { kind: "refunds", label: "Refunds" },
];

/** Fee reports with date range, course and batch filters (D75–D78), each printable on A4. */
export function ReportsPage({ canGenerate }: { canGenerate: boolean }) {
  const today = todayInDhaka();
  const [kind, setKind] = useState<FeeReportKind>("collections");
  const [from, setFrom] = useState(`${today.slice(0, 7)}-01`);
  const [to, setTo] = useState(today);
  const [courseId, setCourseId] = useState(ALL);
  const [batchId, setBatchId] = useState(ALL);
  const courses = useQuery({ queryKey: instituteKeys.courses({}), queryFn: () => academicApi.courses() });
  const batches = useQuery({ queryKey: instituteKeys.batches({}), queryFn: () => academicApi.batches() });
  const dated = kind === "collections" || kind === "refunds";
  const filters: ReportFilters = {
    ...(dated ? { from, to } : {}),
    course_id: courseId === ALL ? undefined : courseId,
    batch_id: batchId === ALL ? undefined : batchId,
  };

  return (
    <>
      <PageHeader title="Fees" description="Reports by date, course and batch. Totals count valid payments; voided receipts are listed apart." />
      <FeesTabs canGenerate={canGenerate} canReport />
      <div className="flex flex-wrap gap-1" role="tablist" aria-label="Report">
        {REPORTS.map((r) => (
          <Button key={r.kind} role="tab" aria-selected={kind === r.kind} size="sm" variant={kind === r.kind ? "default" : "outline"} onClick={() => setKind(r.kind)}>
            {r.label}
          </Button>
        ))}
      </div>
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 pt-6">
          {dated && (
            <>
              <FormField id="report-from" label="From">
                <Input id="report-from" type="date" className="w-40" value={from} onChange={(e) => setFrom(e.target.value)} />
              </FormField>
              <FormField id="report-to" label="To">
                <Input id="report-to" type="date" className="w-40" value={to} onChange={(e) => setTo(e.target.value)} />
              </FormField>
            </>
          )}
          <FormField id="report-course" label="Course">
            <Select
              value={courseId}
              onValueChange={(v) => {
                setCourseId(v);
                setBatchId(ALL);
              }}
            >
              <SelectTrigger id="report-course" className="w-52">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All courses</SelectItem>
                {(courses.data ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          <FormField id="report-batch" label="Batch">
            <Select value={batchId} onValueChange={setBatchId}>
              <SelectTrigger id="report-batch" className="w-52">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All batches</SelectItem>
                {(batches.data ?? [])
                  .filter((b) => courseId === ALL || b.course_id === courseId)
                  .map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name} · {b.course_name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </FormField>
          <Button variant="outline" asChild className="ml-auto">
            <a href={reportPrintUrl(kind, filters)} target="_blank" rel="noreferrer">
              <Printer /> Print
            </a>
          </Button>
        </CardContent>
      </Card>
      {kind === "collections" && <Collections filters={filters} />}
      {(kind === "dues" || kind === "former-dues") && <Dues filters={filters} former={kind === "former-dues"} />}
      {kind === "refunds" && <Refunds filters={filters} />}
    </>
  );
}

const th = "py-1.5 pr-3 text-left font-medium text-muted-foreground";
const td = "py-1.5 pr-3";
const num = "py-1.5 text-right font-mono tabular-nums";

function Collections({ filters }: { filters: ReportFilters }) {
  const q = useQuery({ queryKey: ["institute-report", "collections", filters], queryFn: () => reportsApi.collections(filters) });
  if (q.isPending) return <LoadingState rows={4} />;
  if (q.error) return <ErrorState message={q.error.message} onRetry={() => q.refetch()} />;
  const r = q.data;
  return (
    <Card>
      <CardContent className="space-y-6 pt-6" data-testid="collection-report">
        <div className="grid gap-3 sm:grid-cols-3">
          <Stat label="Collected" value={formatAmount(r.collected)} />
          <Stat label="Refunded" value={formatAmount(r.refunded)} />
          <Stat label="Net collection" value={formatAmount(r.net)} testId="net" />
        </div>
        {r.by_method.length > 0 && <p className="text-sm">{r.by_method.map((m) => `${METHOD_LABEL[m.method]} ${formatAmount(m.amount)}`).join(" · ")}</p>}
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b">
              <th className={th}>Date</th>
              <th className={th}>Receipt</th>
              <th className={th}>Student</th>
              <th className={th}>Method</th>
              <th className="py-1.5 text-right font-medium text-muted-foreground">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {r.payments.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-3 text-muted-foreground">
                  No payments in this period.
                </td>
              </tr>
            ) : (
              r.payments.map((p) => (
                <tr key={p.payment_id}>
                  <td className={td}>{formatDate(p.paid_on)}</td>
                  <td className={`${td} font-mono`}>{p.receipt_label}</td>
                  <td className={td}>
                    {p.student_name} <span className="font-mono text-xs text-muted-foreground">{p.student_code}</span>
                  </td>
                  <td className={td}>{METHOD_LABEL[p.method]}</td>
                  <td className={num}>{formatAmount(p.amount)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        {r.voided.length > 0 && (
          <div className="space-y-1 text-sm">
            <p className="font-medium">Voided receipts (not in the totals)</p>
            <ul className="text-muted-foreground">
              {r.voided.map((v) => (
                <li key={v.payment_id}>
                  <span className="font-mono">{v.receipt_label}</span> · {formatDate(v.paid_on)} · {v.student_name} · {formatAmount(v.amount)} — {v.void_reason}
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Dues({ filters, former }: { filters: ReportFilters; former: boolean }) {
  const q = useQuery({ queryKey: ["institute-report", "dues", former, filters], queryFn: () => reportsApi.dues({ ...filters, ...(former ? { former: "true" as const } : {}) }) });
  if (q.isPending) return <LoadingState rows={4} />;
  if (q.error) return <ErrorState message={q.error.message} onRetry={() => q.refetch()} />;
  const r = q.data;
  const withPhone = r.rows.some((row) => row.guardian_phone);
  return (
    <Card>
      <CardContent className="space-y-6 pt-6" data-testid="dues-report">
        <div className="grid gap-3 sm:grid-cols-3">
          <Stat label="Total due" value={formatAmount(r.total_due)} />
          <Stat label="Overdue" value={formatAmount(r.total_overdue)} />
          <Stat label="Students owing" value={String(r.rows.length)} />
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b">
              <th className={th}>Student</th>
              {withPhone && <th className={th}>Guardian&apos;s mobile</th>}
              <th className={th}>Unpaid</th>
              <th className={th}>Oldest due</th>
              <th className="py-1.5 pr-3 text-right font-medium text-muted-foreground">Overdue</th>
              <th className="py-1.5 text-right font-medium text-muted-foreground">Total due</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {r.rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-3 text-muted-foreground">
                  Nothing is due.
                </td>
              </tr>
            ) : (
              r.rows.map((row) => (
                <tr key={row.student_id}>
                  <td className={td}>
                    <a href={`/app/fees/students/${row.student_id}`} className="hover:underline">
                      {row.student_name}
                    </a>{" "}
                    <span className="font-mono text-xs text-muted-foreground">{row.student_code}</span> {former && <StatusBadge status={row.status} />}
                  </td>
                  {withPhone && <td className={`${td} font-mono`}>{row.guardian_phone}</td>}
                  <td className={td}>{row.unpaid_count}</td>
                  <td className={td}>{formatDate(row.oldest_due)}</td>
                  <td className={`${num} pr-3`}>{formatAmount(row.overdue)}</td>
                  <td className={num}>{formatAmount(row.total_due)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function Refunds({ filters }: { filters: ReportFilters }) {
  const q = useQuery({ queryKey: ["institute-report", "refunds", filters], queryFn: () => reportsApi.refunds(filters) });
  if (q.isPending) return <LoadingState rows={4} />;
  if (q.error) return <ErrorState message={q.error.message} onRetry={() => q.refetch()} />;
  return (
    <Card>
      <CardContent className="space-y-4 pt-6" data-testid="refunds-report">
        <Stat label="Refunded" value={formatAmount(q.data.total)} />
        <ul className="divide-y rounded-md border text-sm">
          {q.data.refunds.length === 0 ? (
            <li className="px-3 py-2 text-muted-foreground">No refunds in this period.</li>
          ) : (
            q.data.refunds.map((f) => (
              <li key={f.id} className="flex flex-wrap gap-x-3 px-3 py-2">
                <span>{formatDate(f.refunded_on)}</span>
                <span className="font-medium">{f.student_name}</span>
                <span className="text-muted-foreground">
                  {f.charge_title} · receipt {f.receipt_label} · {METHOD_LABEL[f.method]} · {f.reason}
                </span>
                <span className="ml-auto font-mono">{formatAmount(f.amount)}</span>
              </li>
            ))
          )}
        </ul>
      </CardContent>
    </Card>
  );
}

function Stat({ label, value, testId }: { label: string; value: string; testId?: string }) {
  return (
    <div className="rounded-lg border p-4">
      <p className="text-2xl font-semibold tabular-nums" data-testid={testId}>
        {value}
      </p>
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  );
}
