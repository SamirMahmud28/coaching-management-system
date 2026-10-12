import { DocumentHeader, FieldRows, SignatureLine, docDate } from "@/components/documents/blocks";
import type { TemplateProps } from "@/server/core/documents/types";
import type { FeeReceiptRecord } from "@/server/modules/fees/receipt-document";
import { formatTaka, toPoisha } from "@/lib/money";

const METHOD_LABEL: Record<string, string> = { CASH: "Cash", BANK_TRANSFER: "Bank transfer", CHEQUE: "Cheque", BKASH: "bKash", NAGAD: "Nagad", ROCKET: "Rocket", OTHER: "Other" };
const taka = (amount: string) => formatTaka(toPoisha(amount));

/** A full-A4 fee receipt (D69, D70); a voided one carries a large VOID mark with its reason (D71). */
export function FeeReceiptTemplate({ record, branding }: TemplateProps) {
  const r = record as FeeReceiptRecord;
  const signatory = branding.signatories[0];
  return (
    <article style={{ position: "relative", height: "100%", boxSizing: "border-box", padding: "16mm 18mm", display: "flex", flexDirection: "column", gap: "6mm" }}>
      <DocumentHeader branding={branding} title="Money receipt" />
      <div style={{ display: "flex", justifyContent: "space-between", gap: "8mm" }}>
        <FieldRows
          labelWidth="30mm"
          rows={[
            ["Received from", `${r.student.name}`],
            ["Student ID", <span key="id" style={{ fontFamily: "monospace" }}>{r.student.code}</span>],
            ["Course", r.programme],
          ]}
        />
        <FieldRows
          labelWidth="26mm"
          rows={[
            ["Receipt no.", <span key="no" style={{ fontFamily: "monospace" }} data-testid="receipt-number">{r.receiptLabel}</span>],
            ["Date", docDate(r.paidOn)],
            ["Method", METHOD_LABEL[r.method] ?? r.method],
            ["Reference", r.reference],
          ]}
        />
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ borderBottom: "0.4mm solid #111827" }}>
            <th style={{ textAlign: "left", padding: "1.5mm 0" }}>For</th>
            <th style={{ textAlign: "right", padding: "1.5mm 0" }}>Amount</th>
          </tr>
        </thead>
        <tbody>
          {r.lines.map((l, i) => (
            <tr key={i} style={{ borderBottom: "0.2mm solid #d1d5db" }}>
              <td style={{ padding: "1.5mm 0" }}>{l.title}</td>
              <td style={{ padding: "1.5mm 0", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{taka(l.amount)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th style={{ textAlign: "left", padding: "2mm 0" }}>Total</th>
            <th style={{ textAlign: "right", padding: "2mm 0", fontVariantNumeric: "tabular-nums", fontSize: "1.2em" }} data-testid="receipt-total">
              {taka(r.amount)}
            </th>
          </tr>
        </tfoot>
      </table>
      <p style={{ fontStyle: "italic" }}>In words: {r.amountInWords}</p>
      {r.remarks && <p style={{ color: "#4b5563" }}>Note: {r.remarks}</p>}

      <div style={{ marginTop: "auto", display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <div style={{ color: "#4b5563" }}>{r.receivedBy && <>Received by: <strong style={{ color: "#111827" }}>{r.receivedBy}</strong></>}</div>
        {signatory && <SignatureLine signatory={signatory} />}
      </div>

      {r.status === "VOID" && (
        <div
          role="note"
          aria-label="This receipt is void"
          style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}
        >
          <div style={{ transform: "rotate(-25deg)", border: "1.2mm solid #b91c1c", color: "#b91c1c", padding: "4mm 14mm", fontSize: "5em", fontWeight: 800, letterSpacing: "0.2em", opacity: 0.8 }}>
            VOID
          </div>
          <p style={{ marginTop: "10mm", color: "#b91c1c", fontWeight: 600, background: "#fff" }}>
            Voided {docDate(r.voidedOn)}: {r.voidReason}
          </p>
        </div>
      )}
    </article>
  );
}
