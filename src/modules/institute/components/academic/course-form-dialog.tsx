"use client";

import { useState } from "react";
import { FormField } from "@/components/shared/form-field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { runAction } from "@/lib/feedback";
import type { CourseFields } from "../../api";

const NOT_SET = "none"; // Radix Select values can't be empty strings.
const DUE_DAYS = [...Array.from({ length: 28 }, (_, i) => i + 1), 31];
export const dueDayLabel = (day: number | null) => (day === null ? "Not set" : day === 31 ? "Last day of the month" : `Day ${day}`);

/** Add or edit a course. The code goes into student IDs when the ID pattern includes it (D15). */
export function CourseFormDialog({
  open,
  onOpenChange,
  course,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present when editing. */
  course?: CourseFields;
  onSubmit: (fields: CourseFields) => Promise<void>;
}) {
  const editing = !!course;
  const [name, setName] = useState(course?.name ?? "");
  const [code, setCode] = useState(course?.code ?? "");
  const [dueDay, setDueDay] = useState<number | null>(course?.due_day ?? null);
  const [description, setDescription] = useState(course?.description ?? "");
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setName(course?.name ?? "");
    setCode(course?.code ?? "");
    setDueDay(course?.due_day ?? null);
    setDescription(course?.description ?? "");
  };

  async function save() {
    setSaving(true);
    const ok = await runAction(() => onSubmit({ name: name.trim(), code: code.trim().toUpperCase(), due_day: dueDay, description: description.trim() || null }));
    setSaving(false);
    if (ok) onOpenChange(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? "Edit course" : "New course"}</DialogTitle>
          <DialogDescription>A course groups its subjects and batches, for example “HSC 2026 Science”.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <FormField id="course-name" required label="Course name">
            <Input id="course-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id="course-code" required label="Short code" hint="Capital letters and digits, e.g. HSC26. Can appear in student IDs.">
              <Input id="course-code" className="font-mono uppercase" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={10} />
            </FormField>
            <FormField id="course-due-day" label="Monthly fee due day" hint="Used when the Fees module is on.">
              <Select value={dueDay === null ? NOT_SET : String(dueDay)} onValueChange={(v) => setDueDay(v === NOT_SET ? null : Number(v))}>
                <SelectTrigger id="course-due-day" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NOT_SET}>Not set</SelectItem>
                  {DUE_DAYS.map((d) => (
                    <SelectItem key={d} value={String(d)}>
                      {dueDayLabel(d)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
          </div>
          <FormField id="course-description" label="Description">
            <Textarea id="course-description" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} maxLength={1000} />
          </FormField>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving || !name.trim() || !code.trim()}>
            {editing ? "Save changes" : "Add course"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
