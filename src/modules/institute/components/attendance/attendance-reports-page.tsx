"use client";

import { useQuery } from "@tanstack/react-query";
import { Printer } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { FormField } from "@/components/shared/form-field";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState, ErrorState, LoadingState } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { todayInDhaka } from "@/lib/dates";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { HowThisWorks } from "@/modules/institute/help/how-this-works";
import { attendanceRegisterPrintUrl, attendanceReportsApi, type AttendanceReportOptions, type AttendanceStatus, type AttendanceTallyWire } from "../../api";
import { instituteKeys } from "../../keys";
import { AttendanceTabs } from "./attendance-tabs";

type Kind = "register" | "low" | "absentees";
const KINDS: { value: Kind; label: string }[] = [
  { value: "register", label: "Monthly register" },
  { value: "low", label: "Low attendance" },
  { value: "absentees", label: "Absentees by day" },
];
const ALL = "all";
const LETTER: Record<AttendanceStatus, string> = { PRESENT: "P", ABSENT: "A", LATE: "L", EXCUSED: "E" };
const addDays = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
export const percent = (t: Pick<AttendanceTallyWire, "percentage">) => (t.percentage === null ? "—" : `${t.percentage}%`);

/**
 * Attendance reports: a batch's register for a month (printable), students below a percentage, and who
 * was absent on a day. The office sees every batch; an instructor the subjects they teach, without guardian mobiles.
 */
export function AttendanceReportsPage({ base, canManageLeave = false, canViewStudents = false, fullGuide = true }: { base: string; canManageLeave?: boolean; canViewStudents?: boolean; fullGuide?: boolean }) {
  const options = useQuery({ queryKey: instituteKeys.attendanceReport("options", {}), queryFn: () => attendanceReportsApi.options() });
  const [kind, setKind] = useState<Kind>("register");

  return (
    <>
      <PageHeader title="Attendance" description="Attendance reports. Only registers that were taken count; classes not held count for nobody." />
      <AttendanceTabs base={base} canManageLeave={canManageLeave} canReport />
      <HowThisWorks topic="attendance-reports" fullGuide={fullGuide} />
      <div className="flex flex-wrap gap-1" role="group" aria-label="Report">
        {KINDS.map((k) => (
          <Button key={k.value} size="sm" variant={kind === k.value ? "default" : "outline"} aria-pressed={kind === k.value} onClick={() => setKind(k.value)}>
            {k.label}
          </Button>
        ))}
      </div>
      {options.isPending ? (
        <LoadingState rows={3} />
      ) : options.error ? (
        <ErrorState message={options.error.message} onRetry={() => options.refetch()} />
      ) : options.data.batches.length === 0 ? (
        <EmptyState title="No batches to report on" description="Reports cover the batches you can see; instructors see the subjects they teach." />
      ) : kind === "register" ? (
        <RegisterReport options={options.data} />
      ) : kind === "low" ? (
        <LowReport options={options.data} canViewStudents={canViewStudents} />
      ) : (
        <AbsenteesReport options={options.data} canViewStudents={canViewStudents} />
      )}
    </>
  );
}

function BatchSelect({ id, options, value, onChange, allowAll }: { id: string; options: AttendanceReportOptions; value: string; onChange: (v: string) => void; allowAll?: boolean }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger id={id} className="w-full sm:w-64">
        <SelectValue placeholder="Choose a batch" />
      </SelectTrigger>
      <SelectContent>
        {allowAll && <SelectItem value={ALL}>All batches</SelectItem>}
        {options.batches.map((b) => (
          <SelectItem key={b.id} value={b.id}>
            {b.course_name} · {b.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

const StudentName = ({ id, name, code, link }: { id: string; name: string; code: string; link: boolean }) => (
  <span>
    {link ? (
      <Link href={`/app/students/${id}`} className="font-medium hover:underline">
        {name}
      </Link>
    ) : (
      <span className="font-medium">{name}</span>
    )}{" "}
    <span className="text-muted-foreground">{code}</span>
  </span>
);

function RegisterReport({ options }: { options: AttendanceReportOptions }) {
  const [batchId, setBatchId] = useState(options.batches[0].id);
  const [subject, setSubject] = useState(ALL);
  const [month, setMonth] = useState(options.today.slice(0, 7));
  const batch = options.batches.find((b) => b.id === batchId)!;
  const q = { batch_id: batchId, month, ...(subject !== ALL ? { batch_subject_id: subject } : {}) };
  const report = useQuery({ queryKey: instituteKeys.attendanceReport("register", q), queryFn: () => attendanceReportsApi.register(q), enabled: /^\d{4}-\d{2}$/.test(month) });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <FormField id="reg-batch" label="Batch">
          <BatchSelect
            id="reg-batch"
            options={options}
            value={batchId}
            onChange={(v) => {
              setBatchId(v);
              setSubject(ALL);
            }}
          />
        </FormField>
        <FormField id="reg-subject" label="Subject">
          <Select value={subject} onValueChange={setSubject}>
            <SelectTrigger id="reg-subject" className="w-full sm:w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All subjects</SelectItem>
              {batch.subjects.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
        <FormField id="reg-month" label="Month">
          <Input id="reg-month" type="month" className="w-auto" value={month} onChange={(e) => setMonth(e.target.value)} />
        </FormField>
        <Button variant="outline" asChild>
          <a href={attendanceRegisterPrintUrl(q)} target="_blank" rel="noreferrer">
            <Printer /> Print
          </a>
        </Button>
      </div>
      {report.isPending ? (
        <LoadingState rows={4} />
      ) : report.error ? (
        <ErrorState message={report.error.message} onRetry={() => report.refetch()} />
      ) : report.data.classes.length === 0 ? (
        <EmptyState title="No registers taken in this month" description={report.data.not_held ? `${report.data.not_held} class(es) were marked not held.` : undefined} />
      ) : (
        <div className="surface-glass-dense overflow-x-auto rounded-lg border" data-testid="monthly-register">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="sticky left-0 bg-background">Student</TableHead>
                {report.data.classes.map((c) => (
                  <TableHead key={c.id} className="px-1 text-center text-xs" title={`${formatDate(c.date)} ${c.starts_at} · ${c.subject_name}`}>
                    {Number(c.date.slice(8))}
                    {subject === ALL && <span className="block font-normal text-muted-foreground">{c.subject_name.slice(0, 3)}</span>}
                  </TableHead>
                ))}
                <TableHead className="text-right">%</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {report.data.rows.map((r) => (
                <TableRow key={r.student_id}>
                  <TableCell className="sticky left-0 bg-background whitespace-nowrap">
                    {r.roll_number && <span className="mr-1 text-muted-foreground">{r.roll_number}.</span>}
                    {r.full_name}
                  </TableCell>
                  {r.statuses.map((st, i) => (
                    <TableCell key={report.data.classes[i].id} className={cn("px-1 text-center text-xs", st === "ABSENT" && "font-semibold text-destructive")}>
                      {st ? LETTER[st] : ""}
                    </TableCell>
                  ))}
                  <TableCell className="text-right tabular-nums">{percent(r)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {report.data && report.data.not_held > 0 && report.data.classes.length > 0 && (
        <p className="text-sm text-muted-foreground">
          {report.data.not_held} {report.data.not_held === 1 ? "class was" : "classes were"} marked not held and aren&apos;t shown.
        </p>
      )}
    </div>
  );
}

function LowReport({ options, canViewStudents }: { options: AttendanceReportOptions; canViewStudents: boolean }) {
  const [from, setFrom] = useState(addDays(options.today, -29));
  const [to, setTo] = useState(options.today);
  const [below, setBelow] = useState("75");
  const [batchId, setBatchId] = useState(ALL);
  const q = { from, to, below: Number(below), ...(batchId !== ALL ? { batch_id: batchId } : {}) };
  const valid = !!from && !!to && Number(below) > 0 && Number(below) <= 100;
  const report = useQuery({ queryKey: instituteKeys.attendanceReport("low", q), queryFn: () => attendanceReportsApi.low(q), enabled: valid });
  const withPhone = report.data?.rows.some((r) => r.guardian_phone);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <FormField id="low-from" label="From">
          <Input id="low-from" type="date" className="w-auto" value={from} onChange={(e) => setFrom(e.target.value)} />
        </FormField>
        <FormField id="low-to" label="To">
          <Input id="low-to" type="date" className="w-auto" value={to} onChange={(e) => setTo(e.target.value)} />
        </FormField>
        <FormField id="low-below" label="Below (%)">
          <Input id="low-below" type="number" min={1} max={100} className="w-24" value={below} onChange={(e) => setBelow(e.target.value)} />
        </FormField>
        <FormField id="low-batch" label="Batch">
          <BatchSelect id="low-batch" options={options} value={batchId} onChange={setBatchId} allowAll />
        </FormField>
      </div>
      {!valid ? null : report.isPending ? (
        <LoadingState rows={4} />
      ) : report.error ? (
        <ErrorState message={report.error.message} onRetry={() => report.refetch()} />
      ) : report.data.rows.length === 0 ? (
        <EmptyState title={`Nobody is below ${report.data.below}%`} description="Only students with at least one counted class appear." />
      ) : (
        <div className="surface-glass-dense overflow-x-auto rounded-lg border" data-testid="low-attendance">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Student</TableHead>
                {withPhone && <TableHead>Guardian</TableHead>}
                <TableHead className="text-right">Present + late</TableHead>
                <TableHead className="text-right">Absent</TableHead>
                <TableHead className="text-right">Excused</TableHead>
                <TableHead className="text-right">%</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {report.data.rows.map((r) => (
                <TableRow key={r.student_id}>
                  <TableCell>
                    <StudentName id={r.student_id} name={r.full_name} code={r.student_code} link={canViewStudents} />
                  </TableCell>
                  {withPhone && (
                    <TableCell className="whitespace-nowrap">
                      {r.guardian_name} · {r.guardian_phone}
                    </TableCell>
                  )}
                  <TableCell className="text-right tabular-nums">{r.present + r.late}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.absent}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.excused}</TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">{percent(r)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

function AbsenteesReport({ options, canViewStudents }: { options: AttendanceReportOptions; canViewStudents: boolean }) {
  const [date, setDate] = useState(options.today || todayInDhaka());
  const [batchId, setBatchId] = useState(ALL);
  const q = { date, ...(batchId !== ALL ? { batch_id: batchId } : {}) };
  const report = useQuery({ queryKey: instituteKeys.attendanceReport("absentees", q), queryFn: () => attendanceReportsApi.absentees(q), enabled: !!date });
  const withPhone = report.data?.rows.some((r) => r.guardian_phone);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <FormField id="abs-date" label="Date">
          <Input id="abs-date" type="date" className="w-auto" value={date} onChange={(e) => setDate(e.target.value)} />
        </FormField>
        <FormField id="abs-batch" label="Batch">
          <BatchSelect id="abs-batch" options={options} value={batchId} onChange={setBatchId} allowAll />
        </FormField>
      </div>
      {!date ? null : report.isPending ? (
        <LoadingState rows={4} />
      ) : report.error ? (
        <ErrorState message={report.error.message} onRetry={() => report.refetch()} />
      ) : report.data.rows.length === 0 ? (
        <EmptyState title="Nobody was absent" description="Only registers taken that day count. Students on approved leave are Excused, not absent." />
      ) : (
        <div className="surface-glass-dense overflow-x-auto rounded-lg border" data-testid="absentees">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Student</TableHead>
                {withPhone && <TableHead>Guardian</TableHead>}
                <TableHead>Missed</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {report.data.rows.map((r) => (
                <TableRow key={r.student_id}>
                  <TableCell>
                    <StudentName id={r.student_id} name={r.full_name} code={r.student_code} link={canViewStudents} />
                  </TableCell>
                  {withPhone && (
                    <TableCell className="whitespace-nowrap">
                      {r.guardian_name} · {r.guardian_phone}
                    </TableCell>
                  )}
                  <TableCell>{r.missed.map((m) => `${m.starts_at} ${m.subject_name} (${m.batch_name})`).join(", ")}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
