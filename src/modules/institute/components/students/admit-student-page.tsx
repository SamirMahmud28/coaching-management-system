"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { FormField } from "@/components/shared/form-field";
import { OneTimePasswordDialog } from "@/components/shared/one-time-password-dialog";
import { PageHeader } from "@/components/shared/page-header";
import { PasswordField } from "@/components/shared/password-field";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { todayInDhaka } from "@/lib/dates";
import { runAction } from "@/lib/feedback";
import { academicApi, settingsApi, studentsApi } from "../../api";
import { instituteKeys } from "../../keys";
import { StudentFieldsForm, emptyStudentForm, studentFieldsFrom, studentFormMissing, type StudentFormValues } from "./student-fields";
import { HowThisWorks } from "@/modules/institute/help/how-this-works";

const NO_COURSE = "none"; // Radix Select values can't be empty strings.

/**
 * Admission (D12, D15, D54–D57): profile, guardian, then the course (required when the ID pattern includes its code) and
 * any batches. The student ID is generated from the pattern unless an Admin types one (D8).
 */
export function AdmitStudentPage({ canJoinBatches }: { canJoinBatches: boolean }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [values, setValues] = useState<StudentFormValues>(emptyStudentForm);
  const [admissionDate, setAdmissionDate] = useState(todayInDhaka());
  const [courseId, setCourseId] = useState<string>(NO_COURSE);
  const [batchIds, setBatchIds] = useState<Set<string>>(new Set());
  const [typeId, setTypeId] = useState(false);
  const [studentCode, setStudentCode] = useState("");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [admitted, setAdmitted] = useState<{ id: string; name: string; password: string; signInWith: string } | null>(null);

  const pattern = useQuery({ queryKey: instituteKeys.studentIdPattern(), queryFn: settingsApi.studentIdPattern });
  const courses = useQuery({ queryKey: instituteKeys.courses({ status: "ACTIVE" }), queryFn: () => academicApi.courses({ status: "ACTIVE" }) });
  const batches = useQuery({ queryKey: instituteKeys.batches({ status: "ACTIVE" }), queryFn: () => academicApi.batches({ status: "ACTIVE" }), enabled: canJoinBatches });
  const needsCourse = !!pattern.data?.include_course_code && !typeId;
  // The chosen course's batches first, then the rest (a student may join batches of any course, D57).
  const batchOptions = [...(batches.data ?? [])].sort((a, b) => Number(b.course_id === courseId) - Number(a.course_id === courseId));

  const missing = studentFormMissing(values, true) || !password || !admissionDate || (needsCourse && courseId === NO_COURSE) || (typeId && !studentCode.trim());

  async function save() {
    setSaving(true);
    await runAction(async () => {
      const result = await studentsApi.admit({
        ...(studentFieldsFrom(values, true) as Required<ReturnType<typeof studentFieldsFrom>>),
        guardian_phone: values.guardian_phone.trim(),
        admission_date: admissionDate,
        course_id: courseId === NO_COURSE ? null : courseId,
        batch_ids: [...batchIds],
        student_code: typeId ? studentCode.trim() : null,
        temporary_password: password,
      });
      await queryClient.invalidateQueries({ queryKey: ["institute-students"] });
      setAdmitted({ id: result.student.id, name: result.student.full_name, password: result.temporary_password, signInWith: result.student.student_code });
    });
    setSaving(false);
  }

  return (
    <>
      <Link href="/app/students" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Students
      </Link>
      <PageHeader title="Admit a student" description="Required: name, gender and the guardian's name, relation and mobile number. The rest can be filled in later." />
      <HowThisWorks topic="admission" />

      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <Card>
          <CardContent className="pt-6">
            <StudentFieldsForm values={values} onChange={(patch) => setValues((v) => ({ ...v, ...patch }))} withContacts />
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Admission</CardTitle>
              <CardDescription>
                {pattern.data ? (
                  <>
                    Student IDs look like <span className="font-mono">{pattern.data.example}</span>.{" "}
                    {pattern.data.include_course_code ? "The course's code goes into the ID, so choose the course." : null}
                  </>
                ) : (
                  " "
                )}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField id="admission-date" required label="Admission date" hint="Its year goes into the student ID.">
                <Input id="admission-date" type="date" value={admissionDate} onChange={(e) => setAdmissionDate(e.target.value)} />
              </FormField>
              <FormField id="admission-course" required={needsCourse} label="Course">
                <Select value={courseId} onValueChange={setCourseId}>
                  <SelectTrigger id="admission-course" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_COURSE}>{needsCourse ? "Choose a course" : "No course yet"}</SelectItem>
                    {(courses.data ?? []).map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name} ({c.code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>
              {canJoinBatches && (
                <div className="space-y-2">
                  <p className="text-sm font-medium">Batches</p>
                  {batchOptions.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No active batches yet. You can add the student to batches later.</p>
                  ) : (
                    <ul className="max-h-56 space-y-2 overflow-y-auto rounded-md border p-3">
                      {batchOptions.map((b) => (
                        <li key={b.id} className="flex items-center gap-2">
                          <Checkbox
                            id={`batch-${b.id}`}
                            checked={batchIds.has(b.id)}
                            onCheckedChange={(checked) =>
                              setBatchIds((prev) => {
                                const next = new Set(prev);
                                if (checked) next.add(b.id);
                                else next.delete(b.id);
                                return next;
                              })
                            }
                          />
                          <Label htmlFor={`batch-${b.id}`} className="font-normal">
                            {b.name} <span className="text-muted-foreground">· {b.course_name}</span>
                          </Label>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
              <div className="flex items-center gap-2">
                <Switch id="type-id" checked={typeId} onCheckedChange={setTypeId} />
                <Label htmlFor="type-id" className="font-normal">
                  Type the student ID myself
                </Label>
              </div>
              {typeId && (
                <FormField id="student-code" required label="Student ID" hint="Letters, digits, - or /. Must be unused in your institute.">
                  <Input id="student-code" className="font-mono uppercase" maxLength={30} value={studentCode} onChange={(e) => setStudentCode(e.target.value.toUpperCase())} />
                </FormField>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Sign-in</CardTitle>
              <CardDescription>The student signs in with their student ID and must change this password at first sign-in.</CardDescription>
            </CardHeader>
            <CardContent>
              <FormField id="student-password" required label="Temporary password" hint="At least 8 characters, with a letter and a digit.">
                <PasswordField id="student-password" value={password} onChange={setPassword} withGenerate />
              </FormField>
            </CardContent>
          </Card>

          <div className="flex justify-end gap-2">
            <Button variant="outline" asChild>
              <Link href="/app/students">Cancel</Link>
            </Button>
            <Button onClick={save} disabled={saving || missing}>
              Admit student
            </Button>
          </div>
        </div>
      </div>

      <OneTimePasswordDialog
        value={admitted}
        onClose={() => {
          const id = admitted?.id;
          setAdmitted(null);
          if (id) router.push(`/app/students/${id}`);
        }}
      />
    </>
  );
}
