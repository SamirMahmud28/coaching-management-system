import type { CSSProperties } from "react";
import { DocumentHeader, FieldRows, SignatureLine, docDate } from "@/components/documents/blocks";
import type { TemplateProps } from "@/server/core/documents/types";
import type { MarksheetRecord, MeritListRecord } from "@/server/modules/exams/result-documents";
import type { PaperOutcome, StudentOutcome } from "@/server/modules/exams/result-engine";

const cell: CSSProperties = { padding: "1.4mm 1.5mm", borderBottom: "0.2mm solid #d1d5db", textAlign: "left", verticalAlign: "top" };
const num: CSSProperties = { ...cell, textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" };
const fmt = (n: number | null) => (n === null ? "—" : Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0$/, ""));
const KIND: Record<string, string> = { WEEKLY: "Weekly test", MONTHLY: "Monthly test", MODEL: "Model test", CUSTOM: "Exam" };

export const paperMark = (p: PaperOutcome) => (p.status === "ABSENT" ? "Absent" : p.status === "NOT_TAKEN" ? "Not taken" : p.status === "PENDING" ? "—" : fmt(p.obtained));
export const resultText = (o: StudentOutcome) => (o.status === "ABSENT" ? "Absent" : o.status === "PENDING" ? "Pending" : o.passed ? "Passed" : "Failed");
const dates = (from: string, to: string) => (from === to ? docDate(from) : `${docDate(from)} – ${docDate(to)}`);

/** A student's marksheet (D102–D109): each paper with its parts, total, GPA and grade when shown, result and position. */
export function ExamMarksheetTemplate({ record, branding }: TemplateProps) {
  const r = record as MarksheetRecord;
  const o = r.row.outcome;
  const grades = r.exam.showGrades;
  return (
    <article style={{ height: "100%", boxSizing: "border-box", padding: "16mm 18mm", display: "flex", flexDirection: "column", gap: "6mm" }} data-testid="marksheet">
      <DocumentHeader branding={branding} title="Marksheet" />
      <div style={{ display: "flex", justifyContent: "space-between", gap: "8mm" }}>
        <FieldRows
          labelWidth="26mm"
          rows={[
            ["Student", r.row.fullName],
            ["Student ID", <span key="id" style={{ fontFamily: "monospace" }}>{r.row.studentCode}</span>],
            ["Batch", `${r.row.batchName}${r.row.rollNumber ? ` · Roll ${r.row.rollNumber}` : ""}`],
          ]}
        />
        <FieldRows
          labelWidth="22mm"
          rows={[
            ["Exam", r.exam.name],
            ["Kind", KIND[r.exam.kind] ?? r.exam.kind],
            ["Course", r.exam.courseName],
            ["Dates", dates(r.exam.startsOn, r.exam.endsOn)],
          ]}
        />
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ borderBottom: "0.4mm solid #111827" }}>
            <th style={{ ...cell, fontWeight: 600 }}>Subject</th>
            <th style={{ ...cell, fontWeight: 600 }}>Parts</th>
            <th style={{ ...num, fontWeight: 600 }}>Full</th>
            <th style={{ ...num, fontWeight: 600 }}>Obtained</th>
            {grades && <th style={{ ...num, fontWeight: 600 }}>Grade</th>}
            {grades && <th style={{ ...num, fontWeight: 600 }}>Point</th>}
          </tr>
        </thead>
        <tbody>
          {o.papers.map((p) => (
            <tr key={p.paperId}>
              <td style={cell}>
                {p.name}
                {p.optional && <span style={{ color: "#6b7280" }}> (optional)</span>}
              </td>
              <td style={{ ...cell, color: "#4b5563" }}>{p.parts.length ? p.parts.map((x) => `${x.name} ${x.obtained === null ? "—" : fmt(x.obtained)}/${fmt(x.fullMarks)}`).join(" · ") : ""}</td>
              <td style={num}>{fmt(p.fullMarks)}</td>
              <td style={num}>{paperMark(p)}</td>
              {grades && <td style={num}>{p.grade ?? "—"}</td>}
              {grades && <td style={num}>{p.gradePoint === null ? "—" : p.gradePoint.toFixed(2)}</td>}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th style={{ ...cell, borderBottom: "none" }} colSpan={2}>
              Total
            </th>
            <th style={{ ...num, borderBottom: "none" }}>{fmt(o.totalFull)}</th>
            <th style={{ ...num, borderBottom: "none" }}>{fmt(o.totalObtained)}</th>
            {grades && <th style={{ ...num, borderBottom: "none" }}>{o.grade ?? "—"}</th>}
            {grades && <th style={{ ...num, borderBottom: "none" }}>{o.gpa === null ? "—" : o.gpa.toFixed(2)}</th>}
          </tr>
        </tfoot>
      </table>
      <FieldRows
        labelWidth="30mm"
        rows={[
          ["Result", <strong key="r" data-testid="marksheet-result">{resultText(o)}</strong>],
          ...(grades ? ([["GPA", o.gpa === null ? "—" : `${o.gpa.toFixed(2)} (${o.grade})`]] as [string, string][]) : []),
          ["Merit position", r.row.position === null ? "—" : `${r.row.position} of ${r.sitting}`],
        ]}
      />
      <div style={{ marginTop: "auto", display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <p style={{ color: "#6b7280", fontSize: "8pt" }}>Printed {docDate(new Date().toISOString())}</p>
        {branding.signatories[0] && <SignatureLine signatory={branding.signatories[0]} />}
      </div>
    </article>
  );
}

/** The combined merit list (D103, D109) on A4; a draft is marked as not yet published. */
export function ExamMeritListTemplate({ record, branding }: TemplateProps) {
  const r = record as MeritListRecord;
  const grades = r.exam.showGrades;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "4mm" }}>
      <DocumentHeader branding={branding} title="Merit list" />
      <p style={{ color: "#4b5563" }}>
        {r.exam.name} · {r.exam.courseName} · {dates(r.exam.startsOn, r.exam.endsOn)}
        {r.exam.state === "DRAFT" && <strong style={{ color: "#b45309" }}> · DRAFT — not published</strong>}
      </p>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "8pt" }}>
        <thead>
          <tr style={{ borderBottom: "0.4mm solid #111827" }}>
            <th style={{ ...num, fontWeight: 600 }}>Pos.</th>
            <th style={{ ...cell, fontWeight: 600 }}>Student</th>
            <th style={{ ...cell, fontWeight: 600 }}>Batch</th>
            {r.papers.map((p) => (
              <th key={p.id} style={{ ...num, fontWeight: 600 }}>
                {p.subjectName}
              </th>
            ))}
            <th style={{ ...num, fontWeight: 600 }}>Total</th>
            {grades && <th style={{ ...num, fontWeight: 600 }}>GPA</th>}
            <th style={{ ...cell, fontWeight: 600 }}>Result</th>
          </tr>
        </thead>
        <tbody>
          {r.rows.map((row) => (
            <tr key={row.studentId}>
              <td style={num}>{row.position ?? "—"}</td>
              <td style={cell}>
                {row.fullName} <span style={{ color: "#6b7280" }}>{row.studentCode}</span>
              </td>
              <td style={cell}>{row.batchName}</td>
              {row.outcome.papers.map((p) => (
                <td key={p.paperId} style={num}>
                  {paperMark(p)}
                  {grades && p.grade && p.status !== "ABSENT" ? ` ${p.grade}` : ""}
                </td>
              ))}
              <td style={num}>{fmt(row.outcome.totalObtained)}</td>
              {grades && <td style={num}>{row.outcome.gpa === null ? "—" : row.outcome.gpa.toFixed(2)}</td>}
              <td style={cell}>{resultText(row.outcome)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p style={{ color: "#4b5563", fontSize: "7pt" }}>
        {r.summary.sitting} sitting · {r.summary.passed} passed · {r.summary.failed} failed · {r.summary.absent} absent from every paper. Positions: passed first, then total marks{grades ? ", then GPA" : ""}; equal results share a position.
      </p>
    </div>
  );
}
