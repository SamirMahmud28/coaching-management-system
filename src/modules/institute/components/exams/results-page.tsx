"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Printer, Send } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState, ErrorState, LoadingState } from "@/components/shared/states";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { notifySuccess } from "@/lib/feedback";
import { cn } from "@/lib/utils";
import { HowThisWorks } from "@/modules/institute/help/how-this-works";
import { marksheetUrl, meritListUrl, resultsApi, type PaperOutcomeWire, type StudentOutcomeWire } from "../../api";
import { instituteKeys } from "../../keys";
import { EXAM_STATE } from "./exams-tabs";

const ALL = "all";
const fmt = (n: number | null) => (n === null ? "—" : Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0$/, ""));
export const paperCell = (p: PaperOutcomeWire) => (p.status === "ABSENT" ? "Abs" : p.status === "NOT_TAKEN" ? "—" : p.status === "PENDING" ? "…" : fmt(p.obtained));
export const resultLabel = (o: StudentOutcomeWire) =>
  o.status === "ABSENT" ? { label: "Absent", tone: "secondary" as const } : o.status === "PENDING" ? { label: "Pending", tone: "warning" as const } : o.passed ? { label: "Passed", tone: "success" as const } : { label: "Failed", tone: "destructive" as const };

/**
 * An exam's results: the combined merit list, filterable by batch; publishing the whole exam once every
 * mark is in; the merit list and marksheets to print.
 */
export function ResultsPage({ base, examId, canPublish, fullGuide = true }: { base: string; examId: string; canPublish: boolean; fullGuide?: boolean }) {
  const queryClient = useQueryClient();
  const [batch, setBatch] = useState(ALL);
  const batchId = batch === ALL ? undefined : batch;
  const results = useQuery({ queryKey: instituteKeys.results(examId, batchId), queryFn: () => resultsApi.get(examId, batchId) });
  const [publishing, setPublishing] = useState(false);

  if (results.isPending) return <LoadingState rows={8} />;
  if (results.error) return <ErrorState message={results.error.message} onRetry={() => results.refetch()} />;
  const { exam, summary, rows, papers, missing } = results.data;
  const state = EXAM_STATE[exam.state];
  const published = exam.state === "PUBLISHED";

  return (
    <>
      <Link href={`${base}/${examId}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> {exam.name}
      </Link>
      <PageHeader
        title={`${exam.name} — results`}
        description={`${exam.course_name} · ${summary.sitting} sitting · ${summary.passed} passed · ${summary.failed} failed · ${summary.absent} absent from every paper${summary.pending ? ` · ${summary.pending} pending` : ""}${summary.highest !== null ? ` · highest ${fmt(summary.highest)}` : ""}`}
        actions={
          <>
            <StatusBadge status={exam.state} label={state.label} tone={state.tone} />
            {canPublish && !published && (
              <Button onClick={() => setPublishing(true)}>
                <Send /> Publish results
              </Button>
            )}
          </>
        }
      />
      <HowThisWorks topic="exams-results" fullGuide={fullGuide} />
      {!published && (
        <p role="status" className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">
          Draft: students can&apos;t see these results until they are published.
          {missing.length > 0 && ` ${missing.length} ${missing.length === 1 ? "student still needs" : "students still need"} marks: ${missing.slice(0, 6).map((m) => `${m.full_name} (${m.papers.join(", ")})`).join("; ")}${missing.length > 6 ? "; …" : ""}.`}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {results.data.batches.length > 1 && (
          <Select value={batch} onValueChange={setBatch}>
            <SelectTrigger aria-label="Batch" className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All batches</SelectItem>
              {results.data.batches.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Button variant="outline" asChild>
          <a href={meritListUrl({ exam: examId, batch: batchId })} target="_blank" rel="noreferrer">
            <Printer /> Print merit list
          </a>
        </Button>
        {published && (
          <Button variant="outline" asChild>
            <a href={marksheetUrl({ exam: examId, batch: batchId })} target="_blank" rel="noreferrer">
              <Printer /> Print marksheets
            </a>
          </Button>
        )}
      </div>

      {rows.length === 0 ? (
        <EmptyState title="No students sit this exam" description="Students in the exam's batches on its first day sit it; On Hold students are left off." />
      ) : (
        <div className="surface-glass-dense overflow-x-auto rounded-lg border" data-testid="results">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">Pos.</TableHead>
                <TableHead>Student</TableHead>
                {papers.map((p) => (
                  <TableHead key={p.id} className="text-right">
                    {p.subject_name}
                    {p.optional && <span className="block text-xs font-normal text-muted-foreground">optional</span>}
                  </TableHead>
                ))}
                <TableHead className="text-right">Total</TableHead>
                {exam.show_grades && <TableHead className="text-right">GPA</TableHead>}
                <TableHead>Result</TableHead>
                {published && <TableHead />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const result = resultLabel(r.outcome);
                return (
                  <TableRow key={r.student_id} data-testid={`result-${r.student_code}`}>
                    <TableCell className="text-right font-semibold tabular-nums">{r.position ?? "—"}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      {r.full_name} <span className="text-muted-foreground">{r.student_code}</span>
                      <span className="block text-xs text-muted-foreground">{r.batch_name}</span>
                    </TableCell>
                    {r.outcome.papers.map((p) => (
                      <TableCell key={p.paper_id} className={cn("text-right tabular-nums", (p.status === "FAILED" || p.status === "ABSENT") && !p.optional && "text-destructive")}>
                        {paperCell(p)}
                        {exam.show_grades && p.grade && p.status !== "PENDING" && <span className="block text-xs text-muted-foreground">{p.grade}</span>}
                      </TableCell>
                    ))}
                    <TableCell className="text-right tabular-nums">{fmt(r.outcome.total_obtained)}</TableCell>
                    {exam.show_grades && (
                      <TableCell className="text-right tabular-nums">
                        {r.outcome.gpa === null ? "—" : r.outcome.gpa.toFixed(2)}
                        {r.outcome.grade && <span className="block text-xs text-muted-foreground">{r.outcome.grade}</span>}
                      </TableCell>
                    )}
                    <TableCell>
                      <StatusBadge status={r.outcome.status} label={result.label} tone={result.tone} />
                    </TableCell>
                    {published && (
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" asChild>
                          <a href={marksheetUrl({ exam: examId, student: r.student_id })} target="_blank" rel="noreferrer">
                            Marksheet
                          </a>
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <ConfirmDialog
        open={publishing}
        onOpenChange={setPublishing}
        title={`Publish ${exam.name}?`}
        description="Every batch's results are published together, and students see them in their portal. The current grading scale is kept with this exam. After publishing, Owner or Admin can still correct a mark, with a reason."
        confirmLabel="Publish results"
        onConfirm={async () => {
          await resultsApi.publish(examId);
          await Promise.all([queryClient.invalidateQueries({ queryKey: ["institute-exam-results", examId] }), queryClient.invalidateQueries({ queryKey: instituteKeys.exam(examId) }), queryClient.invalidateQueries({ queryKey: ["institute-exams"] })]);
          notifySuccess("Results published.");
        }}
      />
    </>
  );
}
