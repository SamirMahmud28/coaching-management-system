import type { CSSProperties, ReactNode } from "react";
import { DocumentHeader, docDate } from "@/components/documents/blocks";
import type { TemplateProps } from "@/server/core/documents/types";
import type { FeeReportRecord } from "@/server/modules/fees/report-document";
import type { collectionReport, duesReport, refundsReport } from "@/server/modules/fees/reports";
import { todayInDhaka } from "@/lib/dates";
import { formatTaka, toPoisha } from "@/lib/money";

const METHOD: Record<string, string> = { CASH: "Cash", BANK_TRANSFER: "Bank transfer", CHEQUE: "Cheque", BKASH: "bKash", NAGAD: "Nagad", ROCKET: "Rocket", OTHER: "Other" };
const taka = (amount: string) => formatTaka(toPoisha(amount));
const cell: CSSProperties = { padding: "1.2mm 1.5mm", borderBottom: "0.2mm solid #d1d5db", textAlign: "left", verticalAlign: "top" };
const num: CSSProperties = { ...cell, textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" };

function Table({ head, rows, foot }: { head: { label: string; numeric?: boolean }[]; rows: ReactNode[][]; foot?: ReactNode[] }) {
  return (
    <table style={{ width: "100%", borderCollapse: "collapse" }}>
      <thead>
        <tr style={{ borderBottom: "0.4mm solid #111827" }}>
          {head.map((h) => (
            <th key={h.label} style={{ ...(h.numeric ? num : cell), fontWeight: 600 }}>
              {h.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr>
            <td colSpan={head.length} style={{ ...cell, color: "#4b5563" }}>
              Nothing in this period.
            </td>
          </tr>
        ) : (
          rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => (
                <td key={j} style={head[j].numeric ? num : cell}>
                  {c}
                </td>
              ))}
            </tr>
          ))
        )}
      </tbody>
      {foot && (
        <tfoot>
          <tr>
            {foot.map((c, j) => (
              <th key={j} style={{ ...(head[j].numeric ? num : cell), fontWeight: 700, borderBottom: "none" }}>
                {c}
              </th>
            ))}
          </tr>
        </tfoot>
      )}
    </table>
  );
}

/** Collections, dues and refunds on A4, headed with the institute and the filters used. */
export function FeeReportTemplate({ record, branding }: TemplateProps) {
  const r = record as FeeReportRecord;
  const filters = [r.filters.range ? `${docDate(r.filters.range.from)} – ${docDate(r.filters.range.to)}` : `As of ${docDate(todayInDhaka())}`, r.filters.course, r.filters.batch]
    .filter(Boolean)
    .join(" · ");
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "5mm" }}>
      <DocumentHeader branding={branding} title={r.title} />
      <p style={{ color: "#4b5563" }}>{filters}</p>
      {r.report === "collections" && <Collections data={r.data as Awaited<ReturnType<typeof collectionReport>>} />}
      {(r.report === "dues" || r.report === "former-dues") && <Dues data={r.data as Awaited<ReturnType<typeof duesReport>>} />}
      {r.report === "refunds" && <Refunds data={r.data as Awaited<ReturnType<typeof refundsReport>>} />}
    </div>
  );
}

function Collections({ data }: { data: Awaited<ReturnType<typeof collectionReport>> }) {
  return (
    <>
      <Table
        head={[{ label: "Date" }, { label: "Receipt" }, { label: "Student" }, { label: "Method" }, { label: "Amount", numeric: true }]}
        rows={data.payments.map((p) => [docDate(p.paidOn), p.receiptLabel, `${p.studentName} (${p.studentCode})`, METHOD[p.method], taka(p.amount)])}
        foot={["Collected", "", "", "", taka(data.collected)]}
      />
      <Table
        head={[{ label: "Method" }, { label: "Amount", numeric: true }]}
        rows={[
          ...data.byMethod.map((m) => [METHOD[m.method], taka(m.amount)]),
          ["Refunded in this period", `−${taka(data.refunded)}`],
        ]}
        foot={["Net collection", taka(data.net)]}
      />
      {data.voided.length > 0 && (
        <>
          <p style={{ fontWeight: 600 }}>Voided receipts (not in the totals)</p>
          <Table
            head={[{ label: "Date" }, { label: "Receipt" }, { label: "Student" }, { label: "Reason" }, { label: "Amount", numeric: true }]}
            rows={data.voided.map((v) => [docDate(v.paidOn), v.receiptLabel, `${v.studentName} (${v.studentCode})`, v.voidReason, taka(v.amount)])}
          />
        </>
      )}
    </>
  );
}

function Dues({ data }: { data: Awaited<ReturnType<typeof duesReport>> }) {
  const withPhone = data.rows.some((r) => r.guardianPhone);
  return (
    <Table
      head={[
        { label: "Student" },
        { label: "ID" },
        ...(withPhone ? [{ label: "Guardian's mobile" }] : []),
        { label: "Unpaid", numeric: true },
        { label: "Oldest due" },
        { label: "Overdue", numeric: true },
        { label: "Total due", numeric: true },
      ]}
      rows={data.rows.map((r) => [
        r.studentName,
        r.studentCode,
        ...(withPhone ? [r.guardianPhone] : []),
        r.unpaidCount,
        docDate(r.oldestDue),
        taka(r.overdue),
        taka(r.totalDue),
      ])}
      foot={["Total", "", ...(withPhone ? [""] : []), "", "", taka(data.totalOverdue), taka(data.totalDue)]}
    />
  );
}

function Refunds({ data }: { data: Awaited<ReturnType<typeof refundsReport>> }) {
  return (
    <Table
      head={[{ label: "Date" }, { label: "Student" }, { label: "For" }, { label: "Receipt" }, { label: "Method" }, { label: "Reason" }, { label: "Amount", numeric: true }]}
      rows={data.refunds.map((f) => [docDate(f.refundedOn), `${f.studentName} (${f.studentCode})`, f.chargeTitle, f.receiptLabel, METHOD[f.method], f.reason, taka(f.amount)])}
      foot={["Total", "", "", "", "", "", taka(data.total)]}
    />
  );
}
