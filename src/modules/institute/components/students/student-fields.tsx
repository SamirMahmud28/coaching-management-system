"use client";

import { FormField } from "@/components/shared/form-field";
import { ImageField } from "@/components/shared/image-field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { GUARDIAN_RELATIONS, type Gender, type GuardianRelation, type StudentFields } from "../../api";
import { GENDER_LABEL, RELATION_LABEL } from "../../student-labels";

export { GENDER_LABEL, RELATION_LABEL };


/** The editable form state: every field as the input shows it (empty string for "not set"). */
export interface StudentFormValues {
  full_name: string;
  gender: Gender | "";
  date_of_birth: string;
  phone: string;
  school_name: string;
  school_class: string;
  address: string;
  admin_note: string;
  guardian_name: string;
  guardian_relation: GuardianRelation | "";
  guardian_phone: string;
  photo_file_id: string | null;
}

export const emptyStudentForm: StudentFormValues = {
  full_name: "", gender: "", date_of_birth: "", phone: "", school_name: "", school_class: "", address: "", admin_note: "",
  guardian_name: "", guardian_relation: "", guardian_phone: "", photo_file_id: null,
};

export const studentFormFrom = (s: StudentFields): StudentFormValues => ({
  full_name: s.full_name,
  gender: s.gender,
  date_of_birth: s.date_of_birth ?? "",
  phone: s.phone ?? "",
  school_name: s.school_name ?? "",
  school_class: s.school_class ?? "",
  address: s.address ?? "",
  admin_note: s.admin_note ?? "",
  guardian_name: s.guardian_name,
  guardian_relation: s.guardian_relation,
  guardian_phone: s.guardian_phone ?? "",
  photo_file_id: s.photo_file_id,
});

/** What the API takes. Contact fields are left out when the viewer can't see them (they'd be edited blind). */
export function studentFieldsFrom(v: StudentFormValues, withContacts: boolean): Partial<StudentFields> {
  const fields: Partial<StudentFields> = {
    full_name: v.full_name.trim(),
    gender: v.gender as Gender,
    date_of_birth: v.date_of_birth || null,
    school_name: v.school_name.trim() || null,
    school_class: v.school_class.trim() || null,
    admin_note: v.admin_note.trim() || null,
    guardian_name: v.guardian_name.trim(),
    guardian_relation: v.guardian_relation as GuardianRelation,
    photo_file_id: v.photo_file_id,
  };
  if (withContacts) Object.assign(fields, { phone: v.phone.trim() || null, address: v.address.trim() || null, guardian_phone: v.guardian_phone.trim() });
  return fields;
}

/** Required before saving (D12, D55). */
export const studentFormMissing = (v: StudentFormValues, withContacts: boolean) =>
  !v.full_name.trim() || !v.gender || !v.guardian_name.trim() || !v.guardian_relation || (withContacts && !v.guardian_phone.trim());

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-4">
      <legend className="mb-2 text-sm font-semibold">{title}</legend>
      {children}
    </fieldset>
  );
}

/** The student's profile fields, grouped as on a coaching admission form (D54). */
export function StudentFieldsForm({
  values,
  onChange,
  withContacts,
}: {
  values: StudentFormValues;
  onChange: (patch: Partial<StudentFormValues>) => void;
  /** Whether the viewer may see and edit mobile numbers and the address. */
  withContacts: boolean;
}) {
  const field = (key: keyof StudentFormValues) => ({ value: (values[key] as string) ?? "", onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange({ [key]: e.target.value }) });
  return (
    <div className="space-y-8">
      <Section title="Student">
        <FormField id="student-photo" label="Photo">
          <ImageField id="student-photo" category="STUDENT_PHOTO" label="Student photo" value={values.photo_file_id} onChange={(id) => onChange({ photo_file_id: id })} />
        </FormField>
        <FormField id="student-name" required label="Full name">
          <Input id="student-name" maxLength={100} {...field("full_name")} />
        </FormField>
        <div className="grid gap-4 sm:grid-cols-3">
          <FormField id="student-gender" required label="Gender">
            <Select value={values.gender} onValueChange={(v) => onChange({ gender: v as Gender })}>
              <SelectTrigger id="student-gender" className="w-full">
                <SelectValue placeholder="Choose" />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(GENDER_LABEL) as Gender[]).map((g) => (
                  <SelectItem key={g} value={g}>
                    {GENDER_LABEL[g]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          <FormField id="student-dob" label="Date of birth">
            <Input id="student-dob" type="date" {...field("date_of_birth")} />
          </FormField>
          {withContacts && (
            <FormField id="student-phone" label="Student's mobile" hint="Optional. Not used for signing in.">
              <Input id="student-phone" inputMode="tel" placeholder="01XXXXXXXXX" {...field("phone")} />
            </FormField>
          )}
        </div>
        <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
          <FormField id="student-school" label="School or college">
            <Input id="student-school" maxLength={150} placeholder="e.g. Dhaka College" {...field("school_name")} />
          </FormField>
          <FormField id="student-class" label="Class">
            <Input id="student-class" maxLength={50} placeholder="e.g. HSC 1st year" {...field("school_class")} />
          </FormField>
        </div>
      </Section>

      <Section title="Guardian">
        <div className="grid gap-4 sm:grid-cols-3">
          <FormField id="guardian-name" required label="Guardian's name">
            <Input id="guardian-name" maxLength={100} {...field("guardian_name")} />
          </FormField>
          <FormField id="guardian-relation" required label="Relation">
            <Select value={values.guardian_relation} onValueChange={(v) => onChange({ guardian_relation: v as GuardianRelation })}>
              <SelectTrigger id="guardian-relation" className="w-full">
                <SelectValue placeholder="Choose" />
              </SelectTrigger>
              <SelectContent>
                {GUARDIAN_RELATIONS.map((r) => (
                  <SelectItem key={r} value={r}>
                    {RELATION_LABEL[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          {withContacts && (
            <FormField id="guardian-phone" required label="Guardian's mobile">
              <Input id="guardian-phone" inputMode="tel" placeholder="01XXXXXXXXX" {...field("guardian_phone")} />
            </FormField>
          )}
        </div>
      </Section>

      <Section title="Other">
        {withContacts && (
          <FormField id="student-address" label="Address">
            <Textarea id="student-address" rows={2} maxLength={500} {...field("address")} />
          </FormField>
        )}
        <FormField id="student-note" label="Staff note" hint="Only staff see this; never the student or instructors.">
          <Textarea id="student-note" rows={2} maxLength={1000} {...field("admin_note")} />
        </FormField>
      </Section>
    </div>
  );
}
