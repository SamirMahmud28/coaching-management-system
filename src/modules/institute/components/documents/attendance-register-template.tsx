import type { CSSProperties } from "react";
import { DocumentHeader, docDate } from "@/components/documents/blocks";
import type { TemplateProps } from "@/server/core/documents/types";
import type { AttendanceRegisterRecord } from "@/server/modules/attendance/register-document";

const LETTER = { PRESENT: "P", ABSENT: "A", LATE: "L", EXCUSED: "E" } as const;
const cell: CSSProperties = { padding: "0.8mm 0.6mm", border: "0.2mm solid #d1d5db", textAlign: "center", fontSize: "7pt", fontVariantNumeric: "tabular-nums" };
const left: CSSProperties = { ...cell, textAlign: "left", whiteSpace: "nowrap" };

/** The monthly batch register: students × taken classes, each cell P/A/L/E, with totals and percentage. */
export function AttendanceRegisterTemplate({ record, branding }: TemplateProps) {
  const r = record as AttendanceRegisterRecord;
  const filters = [r.monthLabel, r.courseName, r.batchName, r.subjectName ?? "All subjects"].join(" · ");
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "4mm" }}>
      <DocumentHeader branding={branding} title="Attendance register" />
      <p style={{ color: "#4b5563" }}>
        {filters}
        {r.notHeld > 0 && ` · ${r.notHeld} ${r.notHeld === 1 ? "class" : "classes"} not held (not shown)`}
      </p>
      {r.classes.length === 0 ? (
        <p>No registers were taken in this month.</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={left}>Student</th>
              {r.classes.map((c) => (
                <th key={c.id} style={cell} title={`${c.subjectName} ${c.startsAt}`}>
                  {Number(c.date.slice(8))}
                  {!r.subjectName && <div style={{ fontWeight: 400, fontSize: "5.5pt" }}>{c.subjectName.slice(0, 3)}</div>}
                </th>
              ))}
              <th style={cell}>P+L</th>
              <th style={cell}>A</th>
              <th style={cell}>E</th>
              <th style={cell}>%</th>
            </tr>
          </thead>
          <tbody>
            {r.rows.map((s) => (
              <tr key={s.studentId}>
                <td style={left}>
                  {s.rollNumber && `${s.rollNumber}. `}
                  {s.fullName} <span style={{ color: "#6b7280" }}>{s.studentCode}</span>
                </td>
                {s.statuses.map((st, i) => (
                  <td key={r.classes[i].id} style={{ ...cell, color: st === "ABSENT" ? "#b91c1c" : undefined }}>
                    {st ? LETTER[st] : ""}
                  </td>
                ))}
                <td style={cell}>{s.present + s.late}</td>
                <td style={cell}>{s.absent}</td>
                <td style={cell}>{s.excused}</td>
                <td style={cell}>{s.percentage === null ? "—" : s.percentage}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p style={{ color: "#4b5563", fontSize: "7pt" }}>
        P Present · L Late · A Absent · E Excused · blank: not on that register. Percentage = (Present + Late) ÷ (Present + Late + Absent). Printed {docDate(new Date().toISOString())}.
      </p>
    </div>
  );
}
