"use client";

import { Printer } from "lucide-react";
import { EmptyState } from "@/components/shared/states";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate } from "@/lib/format";
import { HowThisWorks } from "@/modules/institute/help/how-this-works";
import { EXAM_KIND_LABEL, marksheetUrl, type ExamKind, type ResultRowWire } from "../../api";
import { paperCell, resultLabel } from "../exams/results-page";

export interface MyResultsWire {
  student_id: string;
  results: { exam: { id: string; name: string; kind: ExamKind; course_name: string; starts_on: string; show_grades: boolean }; sitting: number; row: ResultRowWire }[];
}

/** The student's published results (D27): each exam's marks, GPA when shown, result, position and marksheet. */
export function MyResultsPage({ data }: { data: MyResultsWire }) {
  return (
    <>
      <PageHeader title="Results" description="Your published exam results." />
      <HowThisWorks topic="results-student" fullGuide={false} />
      {data.results.length === 0 ? (
        <EmptyState title="No results yet" description="Results appear here once the office publishes them." />
      ) : (
        <div className="space-y-4" data-testid="my-results">
          {data.results.map(({ exam, sitting, row }) => {
            const result = resultLabel(row.outcome);
            return (
              <Card key={exam.id}>
                <CardHeader className="flex flex-row flex-wrap items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <CardTitle>{exam.name}</CardTitle>
                    <p className="text-sm text-muted-foreground">
                      {EXAM_KIND_LABEL[exam.kind]} · {exam.course_name} · {formatDate(exam.starts_on)}
                    </p>
                  </div>
                  <StatusBadge status={row.outcome.status} label={result.label} tone={result.tone} />
                  <Button variant="outline" size="sm" asChild>
                    <a href={marksheetUrl({ exam: exam.id, student: row.student_id })} target="_blank" rel="noreferrer">
                      <Printer /> Marksheet
                    </a>
                  </Button>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <ul className="divide-y rounded-md border">
                    {row.outcome.papers.map((p) => (
                      <li key={p.paper_id} className="flex items-center gap-2 px-3 py-1.5">
                        <span className="flex-1">
                          {p.name}
                          {p.optional && <span className="text-muted-foreground"> (optional)</span>}
                        </span>
                        <span className="tabular-nums">
                          {paperCell(p)} / {p.full_marks}
                        </span>
                        {exam.show_grades && p.grade && <span className="w-8 text-right font-medium">{p.grade}</span>}
                      </li>
                    ))}
                  </ul>
                  <p>
                    Total <strong className="tabular-nums">{row.outcome.total_obtained}</strong> of {row.outcome.total_full}
                    {exam.show_grades && row.outcome.gpa !== null && (
                      <>
                        {" "}
                        · GPA <strong className="tabular-nums">{row.outcome.gpa.toFixed(2)}</strong> ({row.outcome.grade})
                      </>
                    )}
                    {row.position !== null && (
                      <>
                        {" "}
                        · Position <strong>{row.position}</strong> of {sitting}
                      </>
                    )}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
