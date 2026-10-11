"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { FormField } from "@/components/shared/form-field";
import { ErrorState, LoadingState } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { runAction } from "@/lib/feedback";
import { formatStudentId, studentIdPatternProblem, type StudentIdPattern } from "@/lib/student-id";
import { settingsApi, type StudentIdPatternRow } from "../../api";
import { instituteKeys } from "../../keys";

const SEPARATOR_LABELS: Record<StudentIdPattern["separator"], string> = { "-": "Dash (KC-2026-0001)", "/": "Slash (KC/2026/0001)", "": "None (KC20260001)" };
const NONE = "none"; // Radix Select values can't be empty strings.

/** The student ID pattern (D15, D16): applies to IDs issued from now on; existing IDs never change. */
export function StudentIdCard() {
  const query = useQuery({ queryKey: instituteKeys.studentIdPattern(), queryFn: settingsApi.studentIdPattern });
  return (
    <Card>
      <CardHeader>
        <CardTitle>Student ID</CardTitle>
        <CardDescription>
          New students get an ID made from these pieces. The number restarts at 1 every year
          (per course, if the course code is included). Admins can still type a different ID when admitting a student.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {query.isPending ? <LoadingState rows={2} /> : query.error ? <ErrorState onRetry={() => query.refetch()} /> : <PatternForm key={JSON.stringify(query.data)} saved={query.data} />}
      </CardContent>
    </Card>
  );
}

function PatternForm({ saved }: { saved: StudentIdPatternRow }) {
  const queryClient = useQueryClient();
  const [pattern, setPattern] = useState<StudentIdPattern>({
    prefix: saved.prefix,
    includeCourseCode: saved.include_course_code,
    separator: saved.separator,
    sequenceWidth: saved.sequence_width,
  });
  const [saving, setSaving] = useState(false);
  const problem = studentIdPatternProblem(pattern);
  const example = problem ? null : formatStudentId(pattern, { courseCode: pattern.includeCourseCode ? "HSC" : null, year: new Date().getFullYear(), sequence: 1 });
  const set = (patch: Partial<StudentIdPattern>) => setPattern((p) => ({ ...p, ...patch }));

  async function save() {
    setSaving(true);
    await runAction(
      async () => {
        await settingsApi.saveStudentIdPattern({
          prefix: pattern.prefix,
          include_course_code: pattern.includeCourseCode,
          separator: pattern.separator,
          sequence_width: pattern.sequenceWidth,
        });
        await queryClient.invalidateQueries({ queryKey: instituteKeys.studentIdPattern() });
      },
      { success: "Student ID pattern saved." },
    );
    setSaving(false);
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="id-prefix" label="Prefix" hint="Optional. Capital letters and digits, starting with a letter." error={pattern.prefix && problem?.includes("prefix") ? problem : undefined}>
          <Input id="id-prefix" value={pattern.prefix} maxLength={10} onChange={(e) => set({ prefix: e.target.value.toUpperCase().replace(/\s/g, "") })} placeholder="e.g. KC" />
        </FormField>
        <FormField id="id-separator" label="Separator">
          <Select value={pattern.separator || NONE} onValueChange={(v) => set({ separator: (v === NONE ? "" : v) as StudentIdPattern["separator"] })}>
            <SelectTrigger id="id-separator" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(["-", "/", ""] as const).map((s) => (
                <SelectItem key={s || NONE} value={s || NONE}>
                  {SEPARATOR_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
        <FormField id="id-width" label="Number of digits">
          <Select value={String(pattern.sequenceWidth)} onValueChange={(v) => set({ sequenceWidth: Number(v) })}>
            <SelectTrigger id="id-width" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[3, 4, 5, 6].map((w) => (
                <SelectItem key={w} value={String(w)}>
                  {w} digits ({"1".padStart(w, "0")})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
        <div className="flex items-center gap-3 pt-6">
          <Switch id="id-course" checked={pattern.includeCourseCode} onCheckedChange={(v) => set({ includeCourseCode: v })} />
          <label htmlFor="id-course" className="text-sm">
            Include the course code
          </label>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/40 px-4 py-3">
        <p className="text-sm">
          Next ID will look like <span className="font-mono font-semibold" data-testid="student-id-example">{example ?? "—"}</span>
          {pattern.includeCourseCode && <span className="text-muted-foreground"> (for a course coded HSC)</span>}
        </p>
        <Button onClick={save} disabled={saving || !!problem}>
          {saving && <Loader2 className="animate-spin" />}
          Save pattern
        </Button>
      </div>
    </div>
  );
}
