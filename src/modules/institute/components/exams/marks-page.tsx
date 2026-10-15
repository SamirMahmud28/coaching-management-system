"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Loader2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { FormField } from "@/components/shared/form-field";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState, ErrorState, LoadingState } from "@/components/shared/states";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { notifySuccess, runAction } from "@/lib/feedback";
import { HowThisWorks } from "@/modules/institute/help/how-this-works";
import { marksApi, type MarkEntryWire, type Roster } from "../../api";
import { instituteKeys } from "../../keys";
import { EXAM_STATE } from "./exams-tabs";

const m = (v: string | null) => (v === null ? "" : v.endsWith(".00") ? v.slice(0, -3) : v.replace(/0$/, ""));

interface Draft {
  absent: boolean;
  /** Paper mark, or one value per part id. */
  values: Record<string, string>;
}
const PAPER = "paper";

function draftOf(row: Roster["rows"][number]): Draft {
  if (!row.mark) return { absent: false, values: {} };
  if (row.mark.absent) return { absent: true, values: {} };
  return { absent: false, values: row.mark.obtained !== null ? { [PAPER]: m(row.mark.obtained) } : Object.fromEntries(Object.entries(row.mark.parts).map(([k, v]) => [k, m(v)])) };
}
const same = (a: Draft, b: Draft) => a.absent === b.absent && JSON.stringify(Object.entries(a.values).filter(([, v]) => v.trim()).sort()) === JSON.stringify(Object.entries(b.values).filter(([, v]) => v.trim()).sort());

/**
 * Marks entry for one paper (D104, D106, D107): one row per student with a box per part (or one for the paper) and
 * Absent. Draft exams: whoever may enter marks; published: Owner/Admin with a reason. Used by the admin panel and the
 * instructor portal (`base` is the exams list there).
 */
export function MarksPage({ base, paperId, fullGuide = true }: { base: string; paperId: string; fullGuide?: boolean }) {
  const roster = useQuery({ queryKey: instituteKeys.roster(paperId), queryFn: () => marksApi.roster(paperId) });
  if (roster.isPending) return <LoadingState rows={8} />;
  if (roster.error) return <ErrorState message={roster.error.message} onRetry={() => roster.refetch()} />;
  return <MarksForm key={roster.dataUpdatedAt} base={base} data={roster.data} fullGuide={fullGuide} />;
}

function MarksForm({ base, data, fullGuide }: { base: string; data: Roster; fullGuide: boolean }) {
  const queryClient = useQueryClient();
  const { paper } = data;
  const initial = new Map(data.rows.map((r) => [r.student_id, draftOf(r)]));
  const [drafts, setDrafts] = useState(() => new Map(initial));
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const columns = paper.parts.length ? paper.parts.map((p) => ({ id: p.id, label: p.name, full: p.full_marks })) : [{ id: PAPER, label: "Marks", full: paper.full_marks }];
  const changed = data.rows.filter((r) => !same(drafts.get(r.student_id)!, initial.get(r.student_id)!));
  const entered = data.rows.filter((r) => r.mark).length;
  const state = EXAM_STATE[paper.exam_state];
  const setDraft = (id: string, d: Draft) => setDrafts(new Map(drafts).set(id, d));

  async function save() {
    setSaving(true);
    await runAction(async () => {
      const entries: MarkEntryWire[] = changed.map((r) => {
        const d = drafts.get(r.student_id)!;
        const filled = Object.entries(d.values).filter(([, v]) => v.trim());
        if (d.absent) return { student_id: r.student_id, absent: true };
        if (!filled.length) return { student_id: r.student_id, clear: true };
        return paper.parts.length
          ? { student_id: r.student_id, parts: filled.map(([part_id, v]) => ({ part_id, obtained: v.trim() })) }
          : { student_id: r.student_id, obtained: d.values[PAPER].trim() };
      });
      const next = await marksApi.save(paper.id, { entries, reason: reason.trim() || null });
      queryClient.setQueryData(instituteKeys.roster(paper.id), next);
      await queryClient.invalidateQueries({ queryKey: instituteKeys.exam(paper.exam_id) });
      notifySuccess(next.saved === 1 ? "1 mark saved." : `${next.saved} marks saved.`);
    });
    setSaving(false);
  }

  return (
    <>
      <Link href={`${base}/${paper.exam_id}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> {paper.exam_name}
      </Link>
      <PageHeader
        title={`${paper.subject_name} marks`}
        description={`Full marks ${m(paper.full_marks)} · pass ${m(paper.pass_marks)}${paper.parts.length ? ` · ${paper.parts.map((p) => `${p.name} ${m(p.full_marks)}${p.pass_marks ? ` (pass ${m(p.pass_marks)})` : ""}`).join(" · ")}` : ""}${paper.optional ? " · optional (4th subject)" : ""}`}
        actions={<StatusBadge status={paper.exam_state} label={state.label} tone={state.tone} />}
      />
      <HowThisWorks topic="exams-marks" fullGuide={fullGuide} />
      {data.why_not && (
        <p role="status" className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">
          {data.why_not}
        </p>
      )}
      {data.rows.length === 0 ? (
        <EmptyState title="No students sit this paper" description="Students in the exam's batches on its first day sit it; On Hold students are left off." />
      ) : (
        <>
          <p className="text-sm text-muted-foreground" data-testid="marks-progress">
            {entered} of {data.rows.length} entered
          </p>
          <ul className="surface-glass-dense divide-y rounded-lg border" data-testid="marks">
            {data.rows.map((r) => {
              const d = drafts.get(r.student_id)!;
              return (
                <li key={r.student_id} className="flex flex-wrap items-end gap-3 px-3 py-2.5" data-testid={`marks-${r.student_code}`}>
                  <div className="min-w-40 flex-1">
                    <p className="font-medium">
                      {r.roll_number && <span className="mr-1.5 text-muted-foreground tabular-nums">{r.roll_number}.</span>}
                      {r.full_name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {r.student_code} · {r.batch_name}
                    </p>
                  </div>
                  {columns.map((c) => (
                    <div key={c.id} className="w-24 space-y-1">
                      <Label htmlFor={`mark-${r.student_id}-${c.id}`} className="text-xs text-muted-foreground">
                        {c.label} /{m(c.full)}
                      </Label>
                      <Input
                        id={`mark-${r.student_id}-${c.id}`}
                        inputMode="decimal"
                        aria-label={`${r.full_name} ${c.label}`}
                        disabled={!data.can_edit || d.absent}
                        value={d.values[c.id] ?? ""}
                        onChange={(e) => setDraft(r.student_id, { absent: false, values: { ...d.values, [c.id]: e.target.value } })}
                      />
                    </div>
                  ))}
                  <div className="flex items-center gap-2 pb-2">
                    <Checkbox
                      id={`absent-${r.student_id}`}
                      aria-label={`${r.full_name} absent`}
                      disabled={!data.can_edit}
                      checked={d.absent}
                      onCheckedChange={(c) => setDraft(r.student_id, { absent: !!c, values: c ? {} : d.values })}
                    />
                    <Label htmlFor={`absent-${r.student_id}`} className="font-normal">
                      Absent
                    </Label>
                  </div>
                </li>
              );
            })}
          </ul>
          {data.can_edit && (
            <div className="space-y-3">
              {data.reason_required && (
                <FormField id="marks-reason" required label="Reason for correcting published marks" hint="Recorded in the audit log with the old and new marks. Students see the corrected result.">
                  <Textarea id="marks-reason" rows={2} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />
                </FormField>
              )}
              <Button onClick={save} disabled={saving || changed.length === 0 || (data.reason_required && !reason.trim())}>
                {saving && <Loader2 className="animate-spin" />}
                {changed.length ? `Save ${changed.length} ${changed.length === 1 ? "change" : "changes"}` : "Save marks"}
              </Button>
            </div>
          )}
        </>
      )}
    </>
  );
}
