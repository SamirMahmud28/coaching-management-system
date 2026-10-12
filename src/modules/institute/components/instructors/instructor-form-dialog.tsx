"use client";

import { useState } from "react";
import { FormField } from "@/components/shared/form-field";
import { PasswordField } from "@/components/shared/password-field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { runAction } from "@/lib/feedback";
import type { Gender, InstructorFields, InstructorRow } from "../../api";

const GENDERS: { value: Gender; label: string }[] = [
  { value: "MALE", label: "Male" },
  { value: "FEMALE", label: "Female" },
  { value: "OTHER", label: "Other" },
];
const NOT_SET = "none"; // Radix Select values can't be empty strings.

/** Add (with a temporary password) or edit an instructor. Signing in needs a mobile number or an email (D17). */
export function InstructorFormDialog({
  open,
  onOpenChange,
  instructor,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present when editing. */
  instructor?: InstructorRow;
  onSubmit: (fields: InstructorFields, temporaryPassword: string | null) => Promise<void>;
}) {
  const editing = !!instructor;
  const [fullName, setFullName] = useState(instructor?.full_name ?? "");
  const [phone, setPhone] = useState(instructor?.phone ?? "");
  const [email, setEmail] = useState(instructor?.email ?? "");
  const [gender, setGender] = useState<Gender | null>(instructor?.gender ?? null);
  const [address, setAddress] = useState(instructor?.address ?? "");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setFullName(instructor?.full_name ?? "");
    setPhone(instructor?.phone ?? "");
    setEmail(instructor?.email ?? "");
    setGender(instructor?.gender ?? null);
    setAddress(instructor?.address ?? "");
    setPassword("");
  };

  async function save() {
    setSaving(true);
    const ok = await runAction(() =>
      onSubmit(
        { full_name: fullName.trim(), phone: phone.trim() || null, email: email.trim() || null, gender, address: address.trim() || null },
        editing ? null : password,
      ),
    );
    setSaving(false);
    if (ok) {
      if (!editing) reset();
      onOpenChange(false);
    }
  }

  const missing = !fullName.trim() || (!phone.trim() && !email.trim()) || (!editing && !password);

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
          <DialogTitle>{editing ? "Edit instructor" : "New instructor"}</DialogTitle>
          <DialogDescription>
            {editing
              ? "Changing the mobile number or email changes what they sign in with."
              : "They sign in with the mobile number or email, and must change the temporary password at first sign-in."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <FormField id="instructor-name" required label="Full name">
            <Input id="instructor-name" value={fullName} onChange={(e) => setFullName(e.target.value)} maxLength={100} />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id="instructor-phone" label="Mobile number" hint="Either one is enough to sign in.">
              <Input id="instructor-phone" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="01XXXXXXXXX" />
            </FormField>
            <FormField id="instructor-email" label="Email">
              <Input id="instructor-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </FormField>
          </div>
          <FormField id="instructor-gender" label="Gender">
            <Select value={gender ?? NOT_SET} onValueChange={(v) => setGender(v === NOT_SET ? null : (v as Gender))}>
              <SelectTrigger id="instructor-gender" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NOT_SET}>Not set</SelectItem>
                {GENDERS.map((g) => (
                  <SelectItem key={g.value} value={g.value}>
                    {g.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          <FormField id="instructor-address" label="Address">
            <Textarea id="instructor-address" value={address} onChange={(e) => setAddress(e.target.value)} rows={2} maxLength={500} />
          </FormField>
          {!editing && (
            <FormField id="instructor-password" required label="Temporary password" hint="At least 8 characters, with a letter and a digit.">
              <PasswordField id="instructor-password" value={password} onChange={setPassword} withGenerate />
            </FormField>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving || missing}>
            {editing ? "Save changes" : "Add instructor"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
