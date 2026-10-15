"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ErrorState, LoadingState } from "@/components/shared/states";
import { StatusBadge } from "@/components/shared/status-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { todayInDhaka } from "@/lib/dates";
import { formatDate } from "@/lib/format";
import { attendanceReportsApi, type AttendanceHistory, type AttendanceStatus } from "../../api";
import { instituteKeys } from "../../keys";
import { percent } from "./attendance-reports-page";

const STATUS: Record<AttendanceStatus, { label: string; tone: "success" | "destructive" | "warning" | "info" }> = {
  PRESENT: { label: "Present", tone: "success" },
  ABSENT: { label: "Absent", tone: "destructive" },
  LATE: { label: "Late", tone: "warning" },
  EXCUSED: { label: "Excused", tone: "info" },
};

/** Totals overall and per subject, then each class, newest first (shared by the profile card and My attendance). */
export function AttendanceSummary({ data, emptyText }: { data: AttendanceHistory; emptyText: string }) {
  if (data.entries.length === 0) return <p className="text-sm text-muted-foreground">{emptyText}</p>;
  return (
    <div className="space-y-3 text-sm">
      <p>
        <span className="text-2xl font-semibold tabular-nums">{percent(data.overall)}</span>{" "}
        <span className="text-muted-foreground">
          · {data.overall.present + data.overall.late} attended, {data.overall.absent} absent, {data.overall.excused} excused
        </span>
      </p>
      <ul className="surface-glass-dense divide-y rounded-md border">
        {data.by_subject.map((s) => (
          <li key={`${s.batch_name}-${s.subject_name}`} className="flex items-center gap-2 px-3 py-1.5">
            <span className="flex-1">
              {s.subject_name} <span className="text-muted-foreground">· {s.batch_name}</span>
            </span>
            <span className="tabular-nums">{percent(s)}</span>
          </li>
        ))}
      </ul>
      <details className="surface-glass-item rounded-md border px-3 py-2">
        <summary className="cursor-pointer font-medium">Each class ({data.entries.length})</summary>
        <ul className="mt-2 max-h-72 space-y-1 overflow-y-auto">
          {data.entries.map((e, i) => (
            <li key={i} className="flex items-center gap-2">
              <span className="w-28 shrink-0 tabular-nums text-muted-foreground">
                {formatDate(e.date)} {e.starts_at}
              </span>
              <span className="flex-1">{e.subject_name}</span>
              {e.status ? <StatusBadge status={e.status} label={STATUS[e.status].label + (e.on_leave ? " · leave" : "")} tone={STATUS[e.status].tone} /> : <span className="text-muted-foreground">Not marked</span>}
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}

const addDays = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

/** A student's attendance on their profile, for staff with attendance.report.view; last 30 days by default. */
export function StudentAttendanceCard({ studentId }: { studentId: string }) {
  const [from, setFrom] = useState(() => addDays(todayInDhaka(), -29));
  const [to, setTo] = useState(() => todayInDhaka());
  const q = { from, to };
  const history = useQuery({ queryKey: instituteKeys.studentAttendance(studentId, q), queryFn: () => attendanceReportsApi.studentHistory(studentId, q), enabled: !!from && !!to });

  return (
    <Card data-testid="student-attendance">
      <CardHeader>
        <CardTitle>Attendance</CardTitle>
        <CardDescription>Taken registers only. Percentage = (Present + Late) ÷ (Present + Late + Absent).</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Input type="date" aria-label="From" className="w-auto" value={from} onChange={(e) => setFrom(e.target.value)} />
          <span>to</span>
          <Input type="date" aria-label="To" className="w-auto" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        {history.isPending ? (
          <LoadingState rows={3} />
        ) : history.error ? (
          <ErrorState message={history.error.message} onRetry={() => history.refetch()} />
        ) : (
          <AttendanceSummary data={history.data} emptyText="No registers with this student in these dates." />
        )}
      </CardContent>
    </Card>
  );
}
