"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, X } from "lucide-react";
import { useState } from "react";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { PageHeader } from "@/components/shared/page-header";
import { ErrorState, LoadingState } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { notifySuccess, runAction } from "@/lib/feedback";
import { HowThisWorks } from "@/modules/institute/help/how-this-works";
import { examsApi, type GradeBandWire } from "../../api";
import { instituteKeys } from "../../keys";
import { ExamsTabs } from "./exams-tabs";

interface Row {
  grade: string;
  min: string;
  point: string;
}
const toRows = (bands: GradeBandWire[]): Row[] => bands.map((b) => ({ grade: b.grade, min: String(b.min_percent), point: String(b.grade_point) }));

/** The institute's grading scale (D102): BD 5.0 until changed. Published exams keep the scale they were published with (D112). */
export function GradeScalePage() {
  const scale = useQuery({ queryKey: instituteKeys.gradeScale(), queryFn: () => examsApi.gradeScale() });
  if (scale.isPending) return <LoadingState rows={6} />;
  if (scale.error) return <ErrorState message={scale.error.message} onRetry={() => scale.refetch()} />;
  return <Editor key={JSON.stringify(scale.data)} initial={scale.data} />;
}

function Editor({ initial }: { initial: { bands: GradeBandWire[]; is_default: boolean } }) {
  const queryClient = useQueryClient();
  const [rows, setRows] = useState<Row[]>(() => toRows(initial.bands));
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const setRow = (i: number, patch: Partial<Row>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  async function save() {
    setSaving(true);
    await runAction(async () => {
      const saved = await examsApi.saveGradeScale(rows.map((r) => ({ grade: r.grade.trim(), min_percent: Number(r.min), grade_point: Number(r.point) })));
      queryClient.setQueryData(instituteKeys.gradeScale(), saved);
      notifySuccess("Grading scale saved.");
    });
    setSaving(false);
  }

  return (
    <>
      <PageHeader title="Exams" description="The grading scale every exam with grades uses." />
      <ExamsTabs canManage />
      <HowThisWorks topic="exams-grading" />
      <Card>
        <CardHeader>
          <CardTitle>Grading scale {initial.is_default && <span className="text-sm font-normal text-muted-foreground">· Bangladesh 5.0 (default)</span>}</CardTitle>
          <CardDescription>
            A mark gets the highest grade whose minimum percentage it reaches. The lowest grade must start at 0% with 0 points: it is the fail grade.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid max-w-md grid-cols-[1fr_1fr_1fr_auto] gap-2 text-sm font-medium">
            <span>Grade</span>
            <span>From (%)</span>
            <span>Grade point</span>
            <span />
          </div>
          {rows.map((r, i) => (
            <div key={i} className="grid max-w-md grid-cols-[1fr_1fr_1fr_auto] gap-2" data-testid={`band-${i}`}>
              <Input aria-label={`Grade ${i + 1}`} maxLength={5} value={r.grade} onChange={(e) => setRow(i, { grade: e.target.value })} />
              <Input aria-label={`From percent ${i + 1}`} inputMode="numeric" value={r.min} onChange={(e) => setRow(i, { min: e.target.value })} />
              <Input aria-label={`Grade point ${i + 1}`} inputMode="decimal" value={r.point} onChange={(e) => setRow(i, { point: e.target.value })} />
              <Button variant="ghost" size="icon" aria-label={`Remove grade ${r.grade || i + 1}`} disabled={rows.length <= 2} onClick={() => setRows(rows.filter((_, j) => j !== i))}>
                <X />
              </Button>
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" disabled={rows.length >= 15} onClick={() => setRows([...rows, { grade: "", min: "", point: "" }])}>
              <Plus /> Add grade
            </Button>
          </div>
          <div className="flex flex-wrap gap-2 border-t pt-4">
            <Button onClick={save} disabled={saving}>
              Save scale
            </Button>
            {!initial.is_default && (
              <Button variant="outline" onClick={() => setResetting(true)}>
                Use the Bangladesh 5.0 scale
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
      <ConfirmDialog
        open={resetting}
        onOpenChange={setResetting}
        title="Go back to the Bangladesh 5.0 scale?"
        description="Your own scale is replaced by the default (A+ from 80% … F below 33%). Draft exams, and exams published from now on, use it. Exams already published keep the scale they were published with."
        confirmLabel="Use default scale"
        onConfirm={async () => {
          const saved = await examsApi.resetGradeScale();
          queryClient.setQueryData(instituteKeys.gradeScale(), saved);
          notifySuccess("The Bangladesh 5.0 scale is back.");
        }}
      />
    </>
  );
}
