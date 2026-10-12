"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ChevronDown, KeyRound, Pencil, Power } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { FormField } from "@/components/shared/form-field";
import { OneTimePasswordDialog } from "@/components/shared/one-time-password-dialog";
import { PageHeader } from "@/components/shared/page-header";
import { PasswordField } from "@/components/shared/password-field";
import { ErrorState, LoadingState } from "@/components/shared/states";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { formatDate } from "@/lib/format";
import { instructorsApi, type InstructorRow } from "../../api";
import { instituteKeys } from "../../keys";
import { InstructorFormDialog } from "./instructor-form-dialog";

const GENDER_LABEL = { MALE: "Male", FEMALE: "Female", OTHER: "Other" } as const;

export function InstructorProfilePage({ id, canManage, canSetStatus }: { id: string; canManage: boolean; canSetStatus: boolean }) {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: instituteKeys.instructor(id), queryFn: () => instructorsApi.get(id) });
  const [editing, setEditing] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [password, setPassword] = useState("");
  const [oneTime, setOneTime] = useState<{ name: string; password: string } | null>(null);

  if (query.isPending) return <LoadingState rows={4} />;
  if (query.error) return <ErrorState message={query.error.message} onRetry={() => query.refetch()} />;
  const instructor = query.data;
  const refresh = () =>
    Promise.all([queryClient.invalidateQueries({ queryKey: instituteKeys.instructor(id) }), queryClient.invalidateQueries({ queryKey: ["institute-instructors"] })]);

  const actions =
    canManage || canSetStatus ? (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline">
            Actions <ChevronDown />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          {canManage && (
            <DropdownMenuItem onSelect={() => setEditing(true)}>
              <Pencil /> Edit details
            </DropdownMenuItem>
          )}
          {canManage && (
            <DropdownMenuItem onSelect={() => setResetting(true)}>
              <KeyRound /> Reset password
            </DropdownMenuItem>
          )}
          {canSetStatus && (
            <DropdownMenuItem variant={instructor.status === "ACTIVE" ? "destructive" : undefined} onSelect={() => setToggling(true)}>
              <Power /> {instructor.status === "ACTIVE" ? "Deactivate" : "Reactivate"}
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    ) : null;

  return (
    <>
      <Link href="/app/instructors" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Instructors
      </Link>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            {instructor.full_name} <StatusBadge status={instructor.status} />
          </span>
        }
        description={instructor.must_change_password ? "Hasn't signed in yet (temporary password)." : undefined}
        actions={actions}
      />
      <Details instructor={instructor} />

      <InstructorFormDialog
        open={editing}
        onOpenChange={setEditing}
        instructor={instructor}
        onSubmit={async (fields) => {
          await instructorsApi.update(id, fields);
          await refresh();
        }}
      />
      <ConfirmDialog
        open={toggling}
        onOpenChange={setToggling}
        title={instructor.status === "ACTIVE" ? `Deactivate ${instructor.full_name}?` : `Reactivate ${instructor.full_name}?`}
        description={
          instructor.status === "ACTIVE"
            ? "They're signed out everywhere and can't sign in until reactivated. Nothing is deleted."
            : "They can sign in again with their existing password."
        }
        confirmLabel={instructor.status === "ACTIVE" ? "Deactivate" : "Reactivate"}
        destructive={instructor.status === "ACTIVE"}
        onConfirm={async () => {
          await instructorsApi.setStatus(id, instructor.status === "ACTIVE" ? "INACTIVE" : "ACTIVE");
          await refresh();
        }}
      />
      <ConfirmDialog
        open={resetting}
        onOpenChange={(open) => {
          setResetting(open);
          if (!open) setPassword("");
        }}
        title={`Reset ${instructor.full_name}'s password?`}
        description="They're signed out everywhere and must choose a new password at their next sign-in."
        confirmLabel="Reset password"
        confirmDisabled={!password}
        onConfirm={async () => {
          await instructorsApi.resetPassword(id, password);
          setOneTime({ name: instructor.full_name, password });
          setPassword("");
          await refresh();
        }}
      >
        <FormField id="instructor-reset-password" required label="Temporary password">
          <PasswordField id="instructor-reset-password" value={password} onChange={setPassword} withGenerate />
        </FormField>
      </ConfirmDialog>
      <OneTimePasswordDialog value={oneTime} onClose={() => setOneTime(null)} />
    </>
  );
}

function Details({ instructor }: { instructor: InstructorRow }) {
  const rows: [string, React.ReactNode][] = [
    ["Mobile number", instructor.phone ? <span className="font-mono">{instructor.phone}</span> : "—"],
    ["Email", instructor.email ?? "—"],
    ["Gender", instructor.gender ? GENDER_LABEL[instructor.gender] : "—"],
    ["Address", instructor.address ?? "—"],
    ["Added", formatDate(instructor.created_at)],
  ];
  return (
    <dl className="grid gap-x-8 gap-y-3 rounded-lg border p-4 text-sm sm:grid-cols-[10rem_1fr]">
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="min-w-0 wrap-break-word">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
