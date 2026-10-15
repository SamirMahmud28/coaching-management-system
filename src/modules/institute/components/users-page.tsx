"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, MoreHorizontal, Plus, Power, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { DataTable, type Column } from "@/components/shared/data-table";
import { FormField } from "@/components/shared/form-field";
import { OneTimePasswordDialog } from "@/components/shared/one-time-password-dialog";
import { PageHeader } from "@/components/shared/page-header";
import { PasswordField } from "@/components/shared/password-field";
import { StatusBadge } from "@/components/shared/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { runAction } from "@/lib/feedback";
import { instituteApi, type RoleRow, type UserRow } from "../api";
import { instituteKeys } from "../keys";
import { HowThisWorks } from "@/modules/institute/help/how-this-works";

// Instructors and students get their logins with their records; ownership is changed by a Platform Admin.
const NOT_ASSIGNABLE_HERE = new Set(["Owner", "Instructor", "Student"]);
const signInId = (u: UserRow) => u.email ?? u.phone ?? u.username ?? "—";

export function InstituteUsersPage({ canManage }: { canManage: boolean }) {
  const users = useQuery({ queryKey: instituteKeys.users(), queryFn: instituteApi.listUsers });
  const roles = useQuery({ queryKey: instituteKeys.roles(), queryFn: instituteApi.listRoles });
  const [creating, setCreating] = useState(false);
  const [editingRoles, setEditingRoles] = useState<UserRow | null>(null);
  const [toggling, setToggling] = useState<UserRow | null>(null);
  const [resetting, setResetting] = useState<UserRow | null>(null);
  const [oneTime, setOneTime] = useState<{ name: string; password: string } | null>(null);
  const assignable = (roles.data?.items ?? []).filter((r) => !NOT_ASSIGNABLE_HERE.has(r.name));

  const columns: Column<UserRow>[] = [
    {
      key: "name",
      header: "Name",
      cell: (u) => (
        <span className="flex flex-wrap items-center gap-2 font-medium">
          {u.name}
          {u.is_owner && (
            <Badge variant="outline" className="gap-1">
              <ShieldCheck /> Owner
            </Badge>
          )}
        </span>
      ),
    },
    { key: "signin", header: "Signs in with", cell: (u) => <span className="font-mono text-sm">{signInId(u)}</span>, className: "hidden md:table-cell" },
    { key: "roles", header: "Roles", cell: (u) => u.roles.map((r) => r.name).join(", ") || "—" },
    { key: "status", header: "Status", cell: (u) => <StatusBadge status={u.banned ? "DISABLED" : "ACTIVE"} /> },
    {
      key: "actions",
      header: <span className="sr-only">Actions</span>,
      className: "w-12 text-right",
      cell: (u) =>
        canManage && !u.is_owner ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${u.name}`}>
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setEditingRoles(u)}>
                <ShieldCheck /> Change roles
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setResetting(u)}>
                <KeyRound /> Reset password
              </DropdownMenuItem>
              <DropdownMenuItem variant={u.banned ? undefined : "destructive"} onSelect={() => setToggling(u)}>
                <Power /> {u.banned ? "Enable" : "Disable"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null,
    },
  ];

  return (
    <>
      <PageHeader
        title="Users"
        description="Everyone who can sign in to your institute, and what they may do."
        actions={
          canManage ? (
            <Button onClick={() => setCreating(true)}>
              <Plus /> New user
            </Button>
          ) : null
        }
      />
      <HowThisWorks topic="users" />
      <DataTable columns={columns} rows={users.data?.items} getRowId={(u) => u.id} isLoading={users.isPending} error={users.error} onRetry={() => users.refetch()} />

      <NewUserDialog open={creating} onOpenChange={setCreating} roles={assignable} onCreated={(name, password) => setOneTime({ name, password })} />
      <RolesDialog user={editingRoles} roles={assignable} onClose={() => setEditingRoles(null)} />
      <ToggleDialog user={toggling} onClose={() => setToggling(null)} />
      <ResetDialog user={resetting} onClose={() => setResetting(null)} onReset={(name, password) => setOneTime({ name, password })} />
      <OneTimePasswordDialog value={oneTime} onClose={() => setOneTime(null)} />
    </>
  );
}

function RoleChecklist({ roles, selected, onChange }: { roles: RoleRow[]; selected: string[]; onChange: (ids: string[]) => void }) {
  return (
    <div className="space-y-2">
      {roles.map((r) => (
        <label key={r.id} className="surface-glass-item flex items-center gap-3 rounded-md border px-3 py-2 text-sm">
          <Checkbox
            checked={selected.includes(r.id)}
            onCheckedChange={(v) => onChange(v ? [...selected, r.id] : selected.filter((id) => id !== r.id))}
            aria-label={r.name}
          />
          <span className="font-medium">{r.name}</span>
          <span className="ml-auto text-xs text-muted-foreground">{r.permissions.length} permissions</span>
        </label>
      ))}
    </div>
  );
}

function NewUserDialog({ open, onOpenChange, roles, onCreated }: { open: boolean; onOpenChange: (open: boolean) => void; roles: RoleRow[]; onCreated: (name: string, password: string) => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [roleIds, setRoleIds] = useState<string[]>([]);
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const reset = () => {
    setName("");
    setEmail("");
    setPhone("");
    setRoleIds([]);
    setPassword("");
  };

  async function create() {
    setSaving(true);
    const ok = await runAction(async () => {
      await instituteApi.createUser({ name, email: email.trim() || null, phone: phone.trim() || null, role_ids: roleIds, temporary_password: password });
      await queryClient.invalidateQueries({ queryKey: instituteKeys.users() });
    });
    setSaving(false);
    if (ok) {
      onCreated(name, password);
      reset();
      onOpenChange(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : (reset(), onOpenChange(false)))}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New user</DialogTitle>
          <DialogDescription>A staff login, such as an Admin or Accountant. They must change the temporary password at first sign-in.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <FormField id="user-name" required label="Name">
            <Input id="user-name" value={name} onChange={(e) => setName(e.target.value)} />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id="user-email" label="Email">
              <Input id="user-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </FormField>
            <FormField id="user-phone" label="Mobile number" hint="Either one is enough to sign in.">
              <Input id="user-phone" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="01XXXXXXXXX" />
            </FormField>
          </div>
          <FormField id="user-roles" required label="Roles">
            <RoleChecklist roles={roles} selected={roleIds} onChange={setRoleIds} />
          </FormField>
          <FormField id="user-password" required label="Temporary password" hint="At least 8 characters, with a letter and a digit.">
            <PasswordField id="user-password" value={password} onChange={setPassword} withGenerate />
          </FormField>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={create} disabled={saving || !name.trim() || (!email.trim() && !phone.trim()) || roleIds.length === 0 || !password}>
            Create user
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RolesDialog({ user, roles, onClose }: { user: UserRow | null; roles: RoleRow[]; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [roleIds, setRoleIds] = useState<string[]>([]);
  return (
    <ConfirmDialog
      open={user !== null}
      onOpenChange={(open) => (open ? setRoleIds(user?.roles.map((r) => r.id) ?? []) : onClose())}
      title={user ? `Roles for ${user.name}` : ""}
      description="Nobody can grant a permission they don't hold themselves."
      confirmLabel="Save roles"
      confirmDisabled={roleIds.length === 0}
      onConfirm={async () => {
        if (!user) return;
        await instituteApi.setUserRoles(user.id, roleIds);
        await queryClient.invalidateQueries({ queryKey: instituteKeys.users() });
      }}
    >
      <RoleChecklist roles={[...roles, ...(user?.roles.filter((r) => !roles.some((a) => a.id === r.id)).map((r) => ({ ...r, is_system: true, permissions: [] })) ?? [])]} selected={roleIds} onChange={setRoleIds} />
    </ConfirmDialog>
  );
}

function ToggleDialog({ user, onClose }: { user: UserRow | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  return (
    <ConfirmDialog
      open={user !== null}
      onOpenChange={(open) => !open && onClose()}
      title={user ? `${user.banned ? "Enable" : "Disable"} ${user.name}?` : ""}
      description={user?.banned ? "They can sign in again." : "They're signed out everywhere and can't sign in until you enable them again. Nothing is deleted."}
      confirmLabel={user?.banned ? "Enable" : "Disable"}
      destructive={!user?.banned}
      onConfirm={async () => {
        if (!user) return;
        await instituteApi.setUserDisabled(user.id, !user.banned);
        await queryClient.invalidateQueries({ queryKey: instituteKeys.users() });
      }}
    />
  );
}

function ResetDialog({ user, onClose, onReset }: { user: UserRow | null; onClose: () => void; onReset: (name: string, password: string) => void }) {
  const [password, setPassword] = useState("");
  return (
    <ConfirmDialog
      open={user !== null}
      onOpenChange={(open) => {
        if (!open) {
          setPassword("");
          onClose();
        }
      }}
      title={user ? `Reset ${user.name}'s password?` : ""}
      description="They're signed out everywhere and must choose a new password at their next sign-in."
      confirmLabel="Reset password"
      confirmDisabled={!password}
      onConfirm={async () => {
        if (!user) return;
        await instituteApi.resetUserPassword(user.id, password);
        onReset(user.name, password);
        setPassword("");
      }}
    >
      <FormField id="reset-password" required label="Temporary password">
        <PasswordField id="reset-password" value={password} onChange={setPassword} withGenerate />
      </FormField>
    </ConfirmDialog>
  );
}
