"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Lock, Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { PageHeader } from "@/components/shared/page-header";
import { ErrorState, LoadingState } from "@/components/shared/states";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { notifySuccess } from "@/lib/feedback";
import { formatDate } from "@/lib/format";
import { HowThisWorks } from "@/modules/institute/help/how-this-works";
import { EXAM_KIND_LABEL, examsApi } from "../../api";
import { instituteKeys } from "../../keys";
import { EXAM_STATE } from "./exams-tabs";

const m = (v: string | null) => (v === null ? "—" : v.endsWith(".00") ? v.slice(0, -3) : v);

/** One exam: its details, batches and papers, each paper linking to its marks (E3). Results (E4) join this page. */
export function ExamPage({ base, examId, canManage, fullGuide = true }: { base: string; examId: string; canManage: boolean; fullGuide?: boolean }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const exam = useQuery({ queryKey: instituteKeys.exam(examId), queryFn: () => examsApi.get(examId) });
  const [deleting, setDeleting] = useState(false);

  if (exam.isPending) return <LoadingState rows={6} />;
  if (exam.error) return <ErrorState message={exam.error.message} onRetry={() => exam.refetch()} />;
  const e = exam.data;
  const state = EXAM_STATE[e.state];

  return (
    <>
      <Link href={base} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Exams
      </Link>
      <PageHeader
        title={e.name}
        description={`${EXAM_KIND_LABEL[e.kind]} · ${e.course_name} · ${e.starts_on === e.ends_on ? formatDate(e.starts_on) : `${formatDate(e.starts_on)} – ${formatDate(e.ends_on)}`}`}
        actions={
          <>
            <StatusBadge status={e.state} label={state.label} tone={state.tone} />
            {canManage && (
              <Button variant="outline" asChild>
                <Link href={`${base}/${e.id}/edit`}>
                  <Pencil /> Edit
                </Link>
              </Button>
            )}
            {canManage && !e.has_marks && e.state === "DRAFT" && (
              <Button variant="outline" onClick={() => setDeleting(true)}>
                <Trash2 /> Delete
              </Button>
            )}
          </>
        }
      />
      <HowThisWorks topic="exams-setup" fullGuide={fullGuide} />

      <div className="grid gap-4 lg:grid-cols-[1fr_2fr]">
        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              <span className="text-muted-foreground">Batches:</span> {e.batches.map((b) => b.name).join(", ")}
            </p>
            <p>
              <span className="text-muted-foreground">Results show:</span> {e.show_grades ? "grades, GPA and marks" : "marks only"}
            </p>
            {e.syllabus && (
              <div>
                <p className="text-muted-foreground">Syllabus</p>
                <p className="whitespace-pre-line">{e.syllabus}</p>
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Papers</CardTitle>
          </CardHeader>
          <CardContent>
            <Table data-testid="exam-papers">
              <TableHeader>
                <TableRow>
                  <TableHead>Subject</TableHead>
                  <TableHead className="text-right">Full</TableHead>
                  <TableHead className="text-right">Pass</TableHead>
                  <TableHead>Parts</TableHead>
                  <TableHead className="text-right">Marks entered</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {e.papers.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      {p.subject_name}
                      {p.optional && <span className="ml-1 text-xs text-muted-foreground">(optional)</span>}
                      {p.locked && <Lock aria-label="Has marks" className="ml-1 inline size-3 text-muted-foreground" />}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{m(p.full_marks)}</TableCell>
                    <TableCell className="text-right tabular-nums">{m(p.pass_marks)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {p.parts.length ? p.parts.map((x) => `${x.name} ${m(x.full_marks)}${x.pass_marks ? ` (pass ${m(x.pass_marks)})` : ""}`).join(" · ") : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{p.mark_count}</TableCell>
                    <TableCell className="text-right">
                      {p.can_open_marks && (
                        <Button variant="outline" size="sm" asChild>
                          <Link href={`${base}/${e.id}/papers/${p.id}`}>{e.state === "DRAFT" ? "Enter marks" : "Marks"}</Link>
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={`Delete ${e.name}?`}
        description="The exam has no marks yet, so it is removed completely. Exams with marks can't be deleted."
        confirmLabel="Delete exam"
        destructive
        onConfirm={async () => {
          await examsApi.remove(e.id);
          await queryClient.invalidateQueries({ queryKey: ["institute-exams"] });
          notifySuccess("Exam deleted.");
          router.push(base);
        }}
      />
    </>
  );
}
