"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus } from "lucide-react";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { DataTable, type Column } from "@/components/shared/data-table";
import { FormField } from "@/components/shared/form-field";
import { PageHeader } from "@/components/shared/page-header";
import { PasswordField } from "@/components/shared/password-field";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { passwordProblem } from "@/lib/password-rule";
import { platformApi, type PlatformAdmin } from "../api";
import { formatDate } from "@/lib/format";
import { platformKeys } from "../keys";
import { useCurrentPlatformAdmin } from "./platform-shell";

export function AdminsPage() {
  const me = useCurrentPlatformAdmin();
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [addKey, setAddKey] = useState(0);
  const [statusChange, setStatusChange] = useState<{ admin: PlatformAdmin; status: PlatformAdmin["status"] } | null>(null);
  const query = useQuery({ queryKey: platformKeys.admins({}), queryFn: () => platformApi.listAdmins({}) });

  const columns: Column<PlatformAdmin>[] = [
    {
      key: "name",
      header: "Name",
      cell: (a) => (
        <span className="font-medium">
          {a.name}
          {a.id === me.id && <span className="ml-2 text-xs font-normal text-muted-foreground">(you)</span>}
        </span>
      ),
    },
    { key: "email", header: "Email", cell: (a) => a.email, className: "hidden sm:table-cell" },
    {
      key: "status",
      header: "Status",
      cell: (a) => (
        <div className="flex flex-wrap gap-1">
          <StatusBadge status={a.status} />
          {a.must_change_password && a.status === "ACTIVE" && <StatusBadge status="TEMP" label="Temporary password" tone="outline" />}
        </div>
      ),
    },
    { key: "created", header: "Created", cell: (a) => formatDate(a.created_at), className: "hidden md:table-cell" },
    {
      key: "actions",
      header: <span className="sr-only">Actions</span>,
      className: "text-right",
      // Hidden for the current admin; the server also refuses self-disable.
      cell: (a) =>
        a.id === me.id ? null : a.status === "ACTIVE" ? (
          <Button size="sm" variant="outline" onClick={() => setStatusChange({ admin: a, status: "DISABLED" })}>
            Disable
          </Button>
        ) : (
          <Button size="sm" variant="outline" onClick={() => setStatusChange({ admin: a, status: "ACTIVE" })}>
            Enable
          </Button>
        ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Platform admins"
        description="People who can manage every institute on the platform."
        actions={
          <Button
            variant="gradient"
            onClick={() => {
              setAddKey((k) => k + 1);
              setAddOpen(true);
            }}
          >
            <Plus /> Add platform admin
          </Button>
        }
      />
      <DataTable columns={columns} rows={query.data?.items} getRowId={(a) => a.id} isLoading={query.isPending} error={query.error} onRetry={() => query.refetch()} />

      <AddAdminDialog key={addKey} open={addOpen} onOpenChange={setAddOpen} />

      <ConfirmDialog
        open={statusChange !== null}
        onOpenChange={(open) => !open && setStatusChange(null)}
        title={statusChange ? `${statusChange.status === "DISABLED" ? "Disable" : "Enable"} ${statusChange.admin.name}?` : ""}
        description={
          statusChange?.status === "DISABLED"
            ? "They're signed out everywhere immediately and can't sign in again until re-enabled."
            : "They can sign in again with their existing password."
        }
        confirmLabel={statusChange?.status === "DISABLED" ? "Disable" : "Enable"}
        destructive={statusChange?.status === "DISABLED"}
        onConfirm={async () => {
          if (!statusChange) return;
          await platformApi.setAdminStatus(statusChange.admin.id, statusChange.status);
          await Promise.all([
            queryClient.invalidateQueries({ queryKey: platformKeys.admins() }),
            queryClient.invalidateQueries({ queryKey: platformKeys.audit() }),
          ]);
          toast.success(`${statusChange.admin.name} ${statusChange.status === "DISABLED" ? "disabled" : "enabled"}.`);
        }}
      />
    </>
  );
}

const addSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(100),
  email: z.email("Enter a valid email address."),
  temporaryPassword: z.string().superRefine((value, ctx) => {
    const problem = passwordProblem(value);
    if (problem) ctx.addIssue({ code: "custom", message: problem });
  }),
});
type AddValues = z.infer<typeof addSchema>;

function AddAdminDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const queryClient = useQueryClient();
  const [serverError, setServerError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ email: string; password: string } | null>(null);
  const form = useForm<AddValues>({ resolver: zodResolver(addSchema), defaultValues: { name: "", email: "", temporaryPassword: "" } });
  const { errors, isSubmitting } = form.formState;

  const submit = form.handleSubmit(async (values) => {
    setServerError(null);
    try {
      await platformApi.createAdmin({ name: values.name, email: values.email, temporary_password: values.temporaryPassword });
      await queryClient.invalidateQueries({ queryKey: platformKeys.admins() });
      setCreated({ email: values.email, password: values.temporaryPassword });
    } catch (err) {
      setServerError(err instanceof Error ? err.message : "Couldn't add the admin. Please try again.");
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {created ? (
          <>
            <DialogHeader>
              <DialogTitle>Platform admin added</DialogTitle>
              <DialogDescription>
                Share the temporary password with {created.email} through a channel you trust. They must change it when they first sign in. It won&apos;t be shown again.
              </DialogDescription>
            </DialogHeader>
            <code className="block rounded-md border p-3 font-mono">{created.password}</code>
            <DialogFooter>
              <Button onClick={() => onOpenChange(false)}>Done</Button>
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={submit} className="space-y-4" noValidate>
            <DialogHeader>
              <DialogTitle>Add platform admin</DialogTitle>
              <DialogDescription>They&apos;ll be able to manage every institute on the platform.</DialogDescription>
            </DialogHeader>
            <FormField id="admin-name" required label="Name" error={errors.name?.message}>
              <Input id="admin-name" autoFocus {...form.register("name")} aria-invalid={!!errors.name || undefined} />
            </FormField>
            <FormField id="admin-email" required label="Email" error={errors.email?.message}>
              <Input id="admin-email" type="email" {...form.register("email")} aria-invalid={!!errors.email || undefined} />
            </FormField>
            <FormField id="admin-password" required label="Temporary password" error={errors.temporaryPassword?.message} hint="At least 8 characters, with a letter and a digit.">
              <Controller
                control={form.control}
                name="temporaryPassword"
                render={({ field }) => (
                  <PasswordField id="admin-password" value={field.value} onChange={field.onChange} onBlur={field.onBlur} withGenerate invalid={!!errors.temporaryPassword} />
                )}
              />
            </FormField>
            {serverError && (
              <p role="alert" className="text-sm text-destructive">
                {serverError}
              </p>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="animate-spin" />}
                Add admin
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
