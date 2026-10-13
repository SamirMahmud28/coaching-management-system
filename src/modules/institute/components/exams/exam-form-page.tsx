"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Lock, Plus, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { FormField } from "@/components/shared/form-field";
import { PageHeader } from "@/components/shared/page-header";
import { ErrorState, LoadingState } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { notifySuccess, runAction } from "@/lib/feedback";
import { HowThisWorks } from "@/modules/institute/help/how-this-works";
import { EXAM_KIND_LABEL, examsApi, type ExamDetail, type ExamKind, type ExamSetupCourse } from "../../api";
import { instituteKeys } from "../../keys";

interface PartDraft {
  name: string;
  fullMarks: string;
  passMarks: string;
}
interface PaperDraft {
  subjectId: string;
  subjectName: string;
  fullMarks: string;
  passMarks: string;
  optional: boolean;
  parts: PartDraft[];
  locked: boolean;
}
interface Draft {
  courseId: string;
  name: string;
  kind: ExamKind;
  startsOn: string;
  endsOn: string;
  syllabus: string;
  showGrades: boolean;
  batchIds: string[];
  papers: PaperDraft[];
}

const trimMarks = (m: string) => (m.endsWith(".00") ? m.slice(0, -3) : m);

function fromExam(e: ExamDetail): Draft {
  return {
    courseId: e.course_id, name: e.name, kind: e.kind, startsOn: e.starts_on, endsOn: e.ends_on, syllabus: e.syllabus ?? "", showGrades: e.show_grades,
    batchIds: e.batches.map((b) => b.id),
    papers: e.papers.map((p) => ({
      subjectId: p.subject_id, subjectName: p.subject_name, fullMarks: trimMarks(p.full_marks), passMarks: trimMarks(p.pass_marks), optional: p.optional, locked: p.locked,
      parts: p.parts.map((x) => ({ name: x.name, fullMarks: trimMarks(x.full_marks), passMarks: x.pass_marks ? trimMarks(x.pass_marks) : "" })),
    })),
  };
}

const blank = (): Draft => ({ courseId: "", name: "", kind: "WEEKLY", startsOn: "", endsOn: "", syllabus: "", showGrades: true, batchIds: [], papers: [] });

/**
 * Create or edit an exam (D101, D102, D108): its course and batches, then one paper per subject with full and pass
 * marks, optionally split into parts. A paper with marks is locked; a published exam keeps its batches and papers.
 */
export function ExamFormPage({ base, examId }: { base: string; examId?: string }) {
  const options = useQuery({ queryKey: instituteKeys.examOptions(), queryFn: () => examsApi.options() });
  const exam = useQuery({ queryKey: instituteKeys.exam(examId ?? ""), queryFn: () => examsApi.get(examId!), enabled: !!examId });
  if (options.isPending || (examId && exam.isPending)) return <LoadingState rows={6} />;
  if (options.error) return <ErrorState message={options.error.message} onRetry={() => options.refetch()} />;
  if (exam.error) return <ErrorState message={exam.error.message} onRetry={() => exam.refetch()} />;
  return <Form base={base} options={options.data} exam={exam.data ?? null} />;
}

function Form({ base, options, exam }: { base: string; options: ExamSetupCourse[]; exam: ExamDetail | null }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [d, setD] = useState<Draft>(() => (exam ? fromExam(exam) : blank()));
  const [saving, setSaving] = useState(false);
  const [adding, setAdding] = useState("");
  const published = exam?.state === "PUBLISHED";
  const fromOptions = options.find((c) => c.id === d.courseId);
  // An edited exam may use batches or subjects archived since; they stay listed.
  const course = {
    batches: [...(fromOptions?.batches ?? []), ...(exam?.batches ?? []).filter((b) => !fromOptions?.batches.some((x) => x.id === b.id))],
    subjects: [...(fromOptions?.subjects ?? []), ...(exam?.papers ?? []).map((p) => ({ id: p.subject_id, name: p.subject_name })).filter((s) => !fromOptions?.subjects.some((x) => x.id === s.id))],
  };
  const unused = course.subjects.filter((s) => !d.papers.some((p) => p.subjectId === s.id));
  const set = (patch: Partial<Draft>) => setD({ ...d, ...patch });
  const setPaper = (i: number, patch: Partial<PaperDraft>) => set({ papers: d.papers.map((p, j) => (j === i ? { ...p, ...patch } : p)) });
  const setPart = (i: number, k: number, patch: Partial<PartDraft>) => setPaper(i, { parts: d.papers[i].parts.map((x, j) => (j === k ? { ...x, ...patch } : x)) });

  async function save() {
    setSaving(true);
    await runAction(async () => {
      const body = {
        name: d.name, kind: d.kind, starts_on: d.startsOn, ends_on: d.endsOn, syllabus: d.syllabus.trim() || null, show_grades: d.showGrades, batch_ids: d.batchIds,
        papers: d.papers.map((p) => ({
          subject_id: p.subjectId, full_marks: p.fullMarks, pass_marks: p.passMarks, optional: p.optional,
          parts: p.parts.map((x) => ({ name: x.name, full_marks: x.fullMarks, pass_marks: x.passMarks.trim() || null })),
        })),
      };
      const saved = exam ? await examsApi.update(exam.id, body) : await examsApi.create({ ...body, course_id: d.courseId });
      await queryClient.invalidateQueries({ queryKey: ["institute-exams"] });
      queryClient.setQueryData(instituteKeys.exam(saved.id), saved);
      notifySuccess(exam ? "Exam saved." : "Exam created.");
      router.push(`${base}/${saved.id}`);
    });
    setSaving(false);
  }

  return (
    <>
      <Link href={exam ? `${base}/${exam.id}` : base} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> {exam ? exam.name : "Exams"}
      </Link>
      <PageHeader title={exam ? "Edit exam" : "New exam"} description={exam ? `${exam.course_name}` : "An exam of one course, for one or more of its batches."} />
      <HowThisWorks topic="exams-setup" />
      {published && (
        <p role="status" className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">
          This exam is published: only its name, kind, dates and syllabus can change.
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {!exam && (
            <FormField id="exam-course" required label="Course" className="sm:col-span-2">
              <Select value={d.courseId} onValueChange={(v) => set({ courseId: v, batchIds: [], papers: [] })}>
                <SelectTrigger id="exam-course" className="w-full">
                  <SelectValue placeholder="Choose a course" />
                </SelectTrigger>
                <SelectContent>
                  {options.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name} ({c.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
          )}
          <FormField id="exam-name" required label="Exam name" hint="For example: Weekly test 5, or Model test 2 (Physics, Chemistry).">
            <Input id="exam-name" maxLength={120} value={d.name} onChange={(e) => set({ name: e.target.value })} />
          </FormField>
          <FormField id="exam-kind" required label="Kind" hint="A label only; every kind works the same way.">
            <Select value={d.kind} onValueChange={(v) => set({ kind: v as ExamKind })}>
              <SelectTrigger id="exam-kind" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(EXAM_KIND_LABEL) as ExamKind[]).map((k) => (
                  <SelectItem key={k} value={k}>
                    {EXAM_KIND_LABEL[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          <FormField id="exam-start" required label="First day">
            <Input id="exam-start" type="date" value={d.startsOn} onChange={(e) => set({ startsOn: e.target.value, endsOn: d.endsOn && d.endsOn >= e.target.value ? d.endsOn : e.target.value })} />
          </FormField>
          <FormField id="exam-end" required label="Last day" hint="Students in the batches on the first day sit the exam; On Hold students are left off.">
            <Input id="exam-end" type="date" value={d.endsOn} onChange={(e) => set({ endsOn: e.target.value })} />
          </FormField>
          <FormField id="exam-syllabus" label="Syllabus" className="sm:col-span-2">
            <Textarea id="exam-syllabus" rows={3} maxLength={5000} value={d.syllabus} onChange={(e) => set({ syllabus: e.target.value })} />
          </FormField>
          <div className="flex items-start gap-3 sm:col-span-2">
            <Switch id="exam-grades" checked={d.showGrades} disabled={published} onCheckedChange={(v) => set({ showGrades: v })} />
            <div>
              <Label htmlFor="exam-grades">Show grades and GPA</Label>
              <p className="text-sm text-muted-foreground">Off: results show marks, pass/fail and position only.</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {d.courseId && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Batches</CardTitle>
              <CardDescription>The batches that sit this exam. Their positions are ranked together.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-4">
              {course.batches.length === 0 && <p className="text-sm text-muted-foreground">This course has no active batches.</p>}
              {course.batches.map((b) => (
                <div key={b.id} className="flex items-center gap-2">
                  <Checkbox
                    id={`exam-batch-${b.id}`}
                    disabled={published}
                    checked={d.batchIds.includes(b.id)}
                    onCheckedChange={(c) => set({ batchIds: c ? [...d.batchIds, b.id] : d.batchIds.filter((x) => x !== b.id) })}
                  />
                  <Label htmlFor={`exam-batch-${b.id}`} className="font-normal">
                    {b.name}
                  </Label>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Papers</CardTitle>
              <CardDescription>One paper per subject. Split a paper into parts (e.g. Written and MCQ) when each part has its own pass mark.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {d.papers.map((p, i) => {
                const fixed = p.locked || published;
                return (
                  <div key={p.subjectId} className="space-y-3 rounded-md border p-3" data-testid={`paper-${p.subjectName}`}>
                    <div className="flex items-center gap-2">
                      <p className="flex-1 font-medium">{p.subjectName}</p>
                      {p.locked && (
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <Lock className="size-3" /> Has marks
                        </span>
                      )}
                      {!fixed && (
                        <Button variant="ghost" size="icon" aria-label={`Remove ${p.subjectName}`} onClick={() => set({ papers: d.papers.filter((_, j) => j !== i) })}>
                          <X />
                        </Button>
                      )}
                    </div>
                    <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                      <FormField id={`paper-full-${i}`} required label="Full marks">
                        <Input id={`paper-full-${i}`} inputMode="decimal" disabled={fixed} value={p.fullMarks} onChange={(e) => setPaper(i, { fullMarks: e.target.value })} />
                      </FormField>
                      <FormField id={`paper-pass-${i}`} required label="Pass marks">
                        <Input id={`paper-pass-${i}`} inputMode="decimal" disabled={fixed} value={p.passMarks} onChange={(e) => setPaper(i, { passMarks: e.target.value })} />
                      </FormField>
                      <div className="flex items-center gap-2 pb-2">
                        <Checkbox id={`paper-optional-${i}`} disabled={fixed} checked={p.optional} onCheckedChange={(c) => setPaper(i, { optional: !!c })} />
                        <Label htmlFor={`paper-optional-${i}`} className="font-normal" title="BD 4th subject: only grade points above 2.0 add to the GPA, and it never fails the student.">
                          Optional (4th subject)
                        </Label>
                      </div>
                    </div>
                    {p.parts.map((x, k) => (
                      <div key={k} className="grid gap-2 sm:grid-cols-[2fr_1fr_1fr_auto] sm:items-end">
                        <FormField id={`part-name-${i}-${k}`} label="Part">
                          <Input id={`part-name-${i}-${k}`} maxLength={40} disabled={fixed} value={x.name} onChange={(e) => setPart(i, k, { name: e.target.value })} />
                        </FormField>
                        <FormField id={`part-full-${i}-${k}`} label="Full">
                          <Input id={`part-full-${i}-${k}`} inputMode="decimal" disabled={fixed} value={x.fullMarks} onChange={(e) => setPart(i, k, { fullMarks: e.target.value })} />
                        </FormField>
                        <FormField id={`part-pass-${i}-${k}`} label="Pass (optional)">
                          <Input id={`part-pass-${i}-${k}`} inputMode="decimal" disabled={fixed} value={x.passMarks} onChange={(e) => setPart(i, k, { passMarks: e.target.value })} />
                        </FormField>
                        {!fixed && (
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Remove part"
                            onClick={() => setPaper(i, { parts: p.parts.length <= 2 ? [] : p.parts.filter((_, j) => j !== k) })}
                          >
                            <X />
                          </Button>
                        )}
                      </div>
                    ))}
                    {!fixed &&
                      (p.parts.length === 0 ? (
                        <Button variant="outline" size="sm" onClick={() => setPaper(i, { parts: [{ name: "Written", fullMarks: "", passMarks: "" }, { name: "MCQ", fullMarks: "", passMarks: "" }] })}>
                          Split into parts
                        </Button>
                      ) : (
                        <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                          The parts&apos; full marks must add up to {p.fullMarks || "the full marks"}.
                          {p.parts.length < 6 && (
                            <Button variant="ghost" size="sm" onClick={() => setPaper(i, { parts: [...p.parts, { name: "", fullMarks: "", passMarks: "" }] })}>
                              <Plus /> Add part
                            </Button>
                          )}
                        </p>
                      ))}
                  </div>
                );
              })}
              {!published && unused.length > 0 && (
                <div className="flex flex-wrap items-end gap-2">
                  <FormField id="add-paper" label="Add a paper">
                    <Select value={adding} onValueChange={setAdding}>
                      <SelectTrigger id="add-paper" className="w-56">
                        <SelectValue placeholder="Choose a subject" />
                      </SelectTrigger>
                      <SelectContent>
                        {unused.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormField>
                  <Button
                    variant="outline"
                    disabled={!adding}
                    onClick={() => {
                      const s = course.subjects.find((x) => x.id === adding)!;
                      set({ papers: [...d.papers, { subjectId: s.id, subjectName: s.name, fullMarks: "100", passMarks: "33", optional: false, parts: [], locked: false }] });
                      setAdding("");
                    }}
                  >
                    <Plus /> Add paper
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      <div className="flex gap-2">
        <Button onClick={save} disabled={saving || !d.courseId || !d.name.trim() || !d.startsOn || !d.endsOn || d.batchIds.length === 0 || d.papers.length === 0}>
          {exam ? "Save exam" : "Create exam"}
        </Button>
        <Button variant="outline" asChild>
          <Link href={exam ? `${base}/${exam.id}` : base}>Cancel</Link>
        </Button>
      </div>
    </>
  );
}
