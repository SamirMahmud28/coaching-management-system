"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, MoreHorizontal, Plus } from "lucide-react";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { FormField } from "@/components/shared/form-field";
import { ImageField } from "@/components/shared/image-field";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState, ErrorState, LoadingState } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { runAction, submitForm } from "@/lib/feedback";
import { settingsApi, type InstitutionProfileRow, type SignatureRow } from "../../api";
import { instituteKeys } from "../../keys";
import { StudentIdCard } from "./student-id-card";

const optionalText = (max: number, message: string) => z.string().trim().max(max, message);
const color = z.string().refine((v) => v === "" || /^#[0-9a-fA-F]{6}$/.test(v), "Use a colour like #1f6feb.");

const profileSchema = z.object({
  display_name: z.string().trim().min(1, "The institute's name is required.").max(150, "At most 150 characters."),
  short_name: optionalText(50, "At most 50 characters."),
  institution_code: optionalText(30, "At most 30 characters."),
  address: optionalText(500, "At most 500 characters."),
  phone: optionalText(30, "At most 30 characters."),
  email: z.string().trim().refine((v) => v === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), "Enter a valid email address."),
  website: z.string().trim().refine((v) => v === "" || /^https?:\/\/\S+$/.test(v), "Enter a full web address, e.g. https://example.com.bd."),
  logo_file_id: z.string(),
  primary_color: color,
  secondary_color: color,
});
type ProfileValues = z.infer<typeof profileSchema>;

const toValues = (p: InstitutionProfileRow): ProfileValues => ({
  display_name: p.display_name, short_name: p.short_name ?? "", institution_code: p.institution_code ?? "", address: p.address ?? "",
  phone: p.phone ?? "", email: p.email ?? "", website: p.website ?? "", logo_file_id: p.logo_file_id ?? "",
  primary_color: p.primary_color ?? "", secondary_color: p.secondary_color ?? "",
});
const orNull = (v: string) => (v.trim() === "" ? null : v.trim());

/** Institute Settings (Core, `settings.manage`): the institution profile and the signatories printed on documents. */
export function InstituteSettingsPage() {
  const profile = useQuery({ queryKey: instituteKeys.profile(), queryFn: settingsApi.profile });

  return (
    <>
      <PageHeader title="Institute Settings" description="Your institute's name, contact details and branding, and the people who sign documents. These appear on receipts, marksheets and other printed documents." />
      {profile.isPending ? (
        <LoadingState />
      ) : profile.error ? (
        <ErrorState onRetry={() => profile.refetch()} />
      ) : (
        <ProfileCard key={JSON.stringify(profile.data)} profile={profile.data} />
      )}
      <StudentIdCard />
      <SignaturesCard />
    </>
  );
}

function ProfileCard({ profile }: { profile: InstitutionProfileRow }) {
  const queryClient = useQueryClient();
  const form = useForm<ProfileValues>({ resolver: zodResolver(profileSchema), defaultValues: toValues(profile) });
  const errors = form.formState.errors;

  async function save(v: ProfileValues) {
    await submitForm(
      form,
      async () => {
        await settingsApi.saveProfile({
          display_name: v.display_name.trim(), short_name: orNull(v.short_name), institution_code: orNull(v.institution_code), address: orNull(v.address),
          phone: orNull(v.phone), email: orNull(v.email), website: orNull(v.website), logo_file_id: v.logo_file_id || null,
          primary_color: orNull(v.primary_color)?.toLowerCase() ?? null, secondary_color: orNull(v.secondary_color)?.toLowerCase() ?? null,
        });
        await queryClient.invalidateQueries({ queryKey: instituteKeys.profile() });
      },
      { success: "School settings saved." },
    );
  }

  const colorField = (name: "primary_color" | "secondary_color", label: string) => (
    <FormField id={name} label={label} error={errors[name]?.message}>
      <Controller
        control={form.control}
        name={name}
        render={({ field }) => (
          <div className="flex items-center gap-2">
            <input
              type="color"
              aria-label={`${label} picker`}
              className="h-9 w-12 cursor-pointer rounded-md border bg-transparent p-1"
              // The native picker always needs a colour; white stands in for "not set" rather than implying black.
              value={/^#[0-9a-fA-F]{6}$/.test(field.value) ? field.value : "#ffffff"}
              onChange={(e) => field.onChange(e.target.value)}
            />
            <Input id={name} placeholder="Not set" className="w-32 font-mono" value={field.value} onChange={field.onChange} onBlur={field.onBlur} />
            {field.value && (
              <Button type="button" variant="ghost" size="sm" onClick={() => field.onChange("")} aria-label={`Clear ${label.toLowerCase()}`}>
                Clear
              </Button>
            )}
          </div>
        )}
      />
    </FormField>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Institution profile</CardTitle>
        <CardDescription>{profile.is_default ? "Not saved yet — the institute's registered name is shown until you save." : "Printed on documents and shown across the app."}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={form.handleSubmit(save)} className="space-y-6">
          <FormField id="logo" label="Logo">
            <Controller control={form.control} name="logo_file_id" render={({ field }) => (
              <ImageField id="logo" category="LOGO" label="School logo" value={field.value || null} onChange={(id) => field.onChange(id ?? "")} />
            )} />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id="display_name" required label="School name" error={errors.display_name?.message} className="sm:col-span-2">
              <Input id="display_name" {...form.register("display_name")} />
            </FormField>
            <FormField id="short_name" label="Short name" hint="Optional, e.g. GVHS" error={errors.short_name?.message}>
              <Input id="short_name" {...form.register("short_name")} />
            </FormField>
            <FormField id="institution_code" label="EIIN / institution code" hint="Optional" error={errors.institution_code?.message}>
              <Input id="institution_code" {...form.register("institution_code")} />
            </FormField>
            <FormField id="address" label="Address" error={errors.address?.message} className="sm:col-span-2">
              <Textarea id="address" rows={2} {...form.register("address")} />
            </FormField>
            <FormField id="phone" label="Phone" error={errors.phone?.message}>
              <Input id="phone" inputMode="tel" {...form.register("phone")} />
            </FormField>
            <FormField id="email" label="Email" error={errors.email?.message}>
              <Input id="email" type="email" {...form.register("email")} />
            </FormField>
            <FormField id="website" label="Website" error={errors.website?.message} className="sm:col-span-2">
              <Input id="website" placeholder="https://" {...form.register("website")} />
            </FormField>
            {colorField("primary_color", "Primary colour")}
            {colorField("secondary_color", "Secondary colour")}
          </div>
          <div className="flex justify-end">
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting && <Loader2 className="animate-spin" />} Save settings
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

const signatureSchema = z.object({
  title: z.string().trim().min(1, "The title is required, e.g. Director.").max(50, "At most 50 characters."),
  person_name: z.string().trim().min(1, "The person's name is required.").max(100, "At most 100 characters."),
  signature_file_id: z.string(),
});
type SignatureValues = z.infer<typeof signatureSchema>;

function SignaturesCard() {
  const queryClient = useQueryClient();
  const list = useQuery({ queryKey: instituteKeys.signatures(), queryFn: settingsApi.signatures });
  const [editing, setEditing] = useState<SignatureRow | "new" | null>(null);
  const [deleting, setDeleting] = useState<SignatureRow | null>(null);

  const refresh = () => queryClient.invalidateQueries({ queryKey: instituteKeys.signatures() });

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div className="space-y-1.5">
          <CardTitle className="text-base">Signatories</CardTitle>
          <CardDescription>People whose signature can print on documents, e.g. the Director or Accounts Officer.</CardDescription>
        </div>
        <Button variant="outline" onClick={() => setEditing("new")}>
          <Plus /> Add signatory
        </Button>
      </CardHeader>
      <CardContent>
        {list.isPending ? (
          <LoadingState rows={2} />
        ) : list.error ? (
          <ErrorState onRetry={() => list.refetch()} />
        ) : list.data.items.length === 0 ? (
          <EmptyState title="No signatories yet" description="Add the director and anyone else who signs receipts or marksheets." />
        ) : (
          <ul className="divide-y">
            {list.data.items.map((s) => (
              <li key={s.id} className="flex items-center gap-4 py-3">
                <div className="flex h-12 w-36 shrink-0 items-center justify-center rounded border">
                  {s.signature_file_id ? (
                    // eslint-disable-next-line @next/next/no-img-element -- authenticated, tenant-scoped bytes
                    <img src={`/api/v1/files/${s.signature_file_id}`} alt={`Signature of ${s.person_name}`} className="max-h-full max-w-full object-contain" />
                  ) : (
                    <span className="text-xs text-muted-foreground">No signature image</span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{s.title}</div>
                  <div className="truncate text-sm text-muted-foreground">{s.person_name}</div>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" aria-label={`Actions for ${s.title}`}>
                      <MoreHorizontal />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => setEditing(s)}>Edit</DropdownMenuItem>
                    <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(s)}>
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      {editing && <SignatureDialog editing={editing} onClose={() => setEditing(null)} onSaved={refresh} />}
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={deleting ? `Delete ${deleting.title}?` : ""}
        description="Documents will no longer be able to print this signature."
        confirmLabel="Delete"
        destructive
        onConfirm={async () => {
          if (!deleting) return;
          await runAction(async () => {
            await settingsApi.deleteSignature(deleting.id);
            await refresh();
          }, { success: `${deleting.title} deleted.` });
          setDeleting(null);
        }}
      />
    </Card>
  );
}

function SignatureDialog({ editing, onClose, onSaved }: { editing: SignatureRow | "new"; onClose: () => void; onSaved: () => Promise<unknown> }) {
  const form = useForm<SignatureValues>({
    resolver: zodResolver(signatureSchema),
    defaultValues: editing === "new" ? { title: "", person_name: "", signature_file_id: "" } : { title: editing.title, person_name: editing.person_name, signature_file_id: editing.signature_file_id ?? "" },
  });
  const errors = form.formState.errors;

  async function save(v: SignatureValues) {
    const body = { title: v.title.trim(), person_name: v.person_name.trim(), signature_file_id: v.signature_file_id || null };
    const ok = await submitForm(
      form,
      async () => {
        if (editing === "new") await settingsApi.createSignature(body);
        else await settingsApi.updateSignature(editing.id, body);
        await onSaved();
      },
      { success: editing === "new" ? "Signatory added." : "Signatory updated.", fieldMap: { personName: "person_name", signatureFileId: "signature_file_id" } },
    );
    if (ok) onClose();
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing === "new" ? "Add signatory" : `Edit ${editing.title}`}</DialogTitle>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(save)} className="space-y-4">
          <FormField id="sig-title" required label="Title" hint="e.g. Director, Accounts Officer, Exam Coordinator" error={errors.title?.message}>
            <Input id="sig-title" autoFocus {...form.register("title")} />
          </FormField>
          <FormField id="sig-name" required label="Name" error={errors.person_name?.message}>
            <Input id="sig-name" {...form.register("person_name")} />
          </FormField>
          <FormField id="sig-image" label="Signature image">
            <Controller control={form.control} name="signature_file_id" render={({ field }) => (
              <ImageField id="sig-image" category="SIGNATURE" label="Signature image" value={field.value || null} onChange={(id) => field.onChange(id ?? "")} />
            )} />
          </FormField>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting && <Loader2 className="animate-spin" />} Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
