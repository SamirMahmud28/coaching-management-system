"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CalendarClock, ChevronDown, Pause, Play, Power, UserCog } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { DataTable, type Column } from "@/components/shared/data-table";
import { FormField } from "@/components/shared/form-field";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState, ErrorState, LoadingState } from "@/components/shared/states";
import { StatusBadge } from "@/components/shared/status-badge";
import { ThemePicker } from "@/components/shared/theme-picker";
import { DEFAULT_APP_THEME } from "@/lib/app-themes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { platformApi, type ModuleKey, type ModuleRequestRow, type TenantDetail, type TenantModule } from "../api";
import { formatDate, formatDateTime } from "@/lib/format";
import { invalidateTenant, platformKeys } from "../keys";
import { DismissRequestDialog } from "./dismiss-request-dialog";
import { useInstituteUrl } from "./platform-shell";

type Lifecycle = "SUSPENDED" | "DEACTIVATED" | "ACTIVE";

export function TenantDetailPage({ id }: { id: string }) {
  const queryClient = useQueryClient();
  const instituteUrl = useInstituteUrl();
  const [tab, setTab] = useState("profile");
  const [lifecycle, setLifecycle] = useState<Lifecycle | null>(null);
  const [reason, setReason] = useState("");
  const [paidUntilOpen, setPaidUntilOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [toggle, setToggle] = useState<{ module: TenantModule; enabled: boolean } | null>(null);

  const query = useQuery({ queryKey: platformKeys.tenant(id), queryFn: () => platformApi.getTenant(id) });

  if (query.isPending) return <LoadingState rows={6} />;
  if (query.error) return <ErrorState message={query.error.message} onRetry={() => query.refetch()} />;
  const tenant = query.data;

  const actions = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline">
          Actions <ChevronDown />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem onSelect={() => setPaidUntilOpen(true)}>
          <CalendarClock /> Set paid-until date
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setTransferOpen(true)}>
          <UserCog /> Transfer ownership
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {tenant.status === "ACTIVE" && (
          <DropdownMenuItem onSelect={() => setLifecycle("SUSPENDED")}>
            <Pause /> Suspend
          </DropdownMenuItem>
        )}
        {(tenant.status === "SUSPENDED" || tenant.status === "DEACTIVATED") && (
          <DropdownMenuItem onSelect={() => setLifecycle("ACTIVE")}>
            <Play /> Reactivate
          </DropdownMenuItem>
        )}
        {(tenant.status === "ACTIVE" || tenant.status === "SUSPENDED") && (
          <DropdownMenuItem variant="destructive" onSelect={() => setLifecycle("DEACTIVATED")}>
            <Power /> Deactivate
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  async function applyLifecycle() {
    if (!lifecycle) return;
    await platformApi.setTenantStatus(id, lifecycle, lifecycle === "ACTIVE" ? undefined : reason);
    await invalidateTenant(queryClient, id);
    toast.success({ SUSPENDED: "Institute suspended.", DEACTIVATED: "Institute deactivated.", ACTIVE: "Institute reactivated." }[lifecycle]);
    setReason("");
  }

  return (
    <>
      <Link href="/institutes" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Institutes
      </Link>

      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            {tenant.name} <StatusBadge status={tenant.status} />
          </span>
        }
        description={
          <>
            <a href={instituteUrl(tenant.subdomain)} target="_blank" rel="noreferrer" className="font-mono hover:underline">
              {tenant.subdomain}
            </a>
            {tenant.owner && (
              <>
                {" · "}Owner: {tenant.owner.name}
                {tenant.owner.email && <span className="text-muted-foreground"> ({tenant.owner.email})</span>}
              </>
            )}
          </>
        }
        actions={actions}
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="modules">Modules</TabsTrigger>
          <TabsTrigger value="requests">Module requests</TabsTrigger>
          <TabsTrigger value="appearance">App theme</TabsTrigger>
        </TabsList>
        <TabsContent value="profile" className="pt-4">
          <ProfileTab tenant={tenant} />
        </TabsContent>
        <TabsContent value="modules" className="pt-4">
          <ModulesTab tenant={tenant} onToggle={(module, enabled) => setToggle({ module, enabled })} />
        </TabsContent>
        <TabsContent value="requests" className="pt-4">
          <RequestsTab
            tenantId={id}
            onFulfill={(key) => {
              const target = tenant.modules.find((m) => m.key === key);
              setTab("modules");
              if (target && !target.enabled) setToggle({ module: target, enabled: true });
            }}
          />
        </TabsContent>
        <TabsContent value="appearance" className="space-y-3 pt-4">
          <p className="text-sm text-muted-foreground">
            The colour theme of this institute&apos;s office app and its student and instructor portals. The change is recorded in the
            institute&apos;s audit log, and the institute&apos;s admins can change it later in Settings.
          </p>
          <ThemePicker
            key={`${tenant.app_theme ?? DEFAULT_APP_THEME}-${String(tenant.paper_background ?? null)}`}
            value={tenant.app_theme ?? DEFAULT_APP_THEME}
            paper={tenant.paper_background ?? null}
            savedMessage={`Theme saved for ${tenant.name}.`}
            onSave={async (theme, paper) => {
              await platformApi.setTenantAppTheme(id, theme, paper);
              await invalidateTenant(queryClient, id);
            }}
          />
        </TabsContent>
      </Tabs>

      <ConfirmDialog
        open={lifecycle !== null}
        onOpenChange={(open) => {
          if (!open) {
            setLifecycle(null);
            setReason("");
          }
        }}
        title={lifecycle && { SUSPENDED: `Suspend ${tenant.name}?`, DEACTIVATED: `Deactivate ${tenant.name}?`, ACTIVE: `Reactivate ${tenant.name}?` }[lifecycle]}
        description={
          lifecycle &&
          {
            SUSPENDED: "Staff and students can still sign in and view data, but nothing can be created or changed until you reactivate it.",
            DEACTIVATED: "Everyone at this institute is blocked, including sign-in. Nothing is deleted, and you can reactivate it later.",
            ACTIVE: "Normal access resumes for everyone at this institute.",
          }[lifecycle]
        }
        confirmLabel={lifecycle ? { SUSPENDED: "Suspend", DEACTIVATED: "Deactivate", ACTIVE: "Reactivate" }[lifecycle] : "Confirm"}
        destructive={lifecycle !== "ACTIVE"}
        confirmDisabled={lifecycle !== "ACTIVE" && !reason.trim()}
        onConfirm={applyLifecycle}
      >
        {lifecycle && lifecycle !== "ACTIVE" && (
          <FormField id="lifecycle-reason" required label="Reason" hint="Shown in the institute's audit log.">
            <Textarea id="lifecycle-reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />
          </FormField>
        )}
      </ConfirmDialog>

      <ModuleToggleDialog tenant={tenant} toggle={toggle} onClose={() => setToggle(null)} />
      <PaidUntilDialog tenant={tenant} open={paidUntilOpen} onOpenChange={setPaidUntilOpen} />
      <TransferOwnershipDialog tenant={tenant} open={transferOpen} onOpenChange={setTransferOpen} />
    </>
  );
}

function ProfileTab({ tenant }: { tenant: TenantDetail }) {
  const rows: [string, React.ReactNode][] = [
    ["Institute name", tenant.name],
    ["Subdomain", <span key="s" className="font-mono">{tenant.subdomain}</span>],
    ["Owner", tenant.owner ? `${tenant.owner.name}${tenant.owner.email ? ` · ${tenant.owner.email}` : ""}` : "—"],
    ["Created", formatDate(tenant.created_at)],
    // Display only in Phase 1 (D4): nothing is switched off when it passes.
    ["Paid until", tenant.paid_until ? formatDate(tenant.paid_until) : "—"],
  ];
  if (tenant.status === "SUSPENDED") rows.push(["Suspended", `${formatDateTime(tenant.suspended_at)} — ${tenant.suspended_reason ?? ""}`]);
  if (tenant.status === "DEACTIVATED") rows.push(["Deactivated", formatDateTime(tenant.deactivated_at)]);

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

function ModulesTab({ tenant, onToggle }: { tenant: TenantDetail; onToggle: (m: TenantModule, enabled: boolean) => void }) {
  const byKey = new Map(tenant.modules.map((m) => [m.key, m]));
  const columns: Column<TenantModule>[] = [
    { key: "name", header: "Module", cell: (m) => <span className="font-medium">{m.name}</span> },
    {
      key: "deps",
      header: "Needs",
      className: "hidden sm:table-cell text-muted-foreground",
      cell: (m) => (m.always_on ? "Always on" : m.depends_on.filter((d) => !byKey.get(d)?.always_on).map((d) => byKey.get(d)?.name).join(", ") || "—"),
    },
    { key: "status", header: "Status", cell: (m) => <StatusBadge status={m.enabled ? "ENABLED" : "DISABLED"} /> },
    {
      key: "switch",
      header: <span className="sr-only">Toggle</span>,
      className: "w-16",
      cell: (m) => (
        <Switch checked={m.enabled} disabled={m.always_on} aria-label={`${m.enabled ? "Disable" : "Enable"} ${m.name}`} onCheckedChange={(v) => onToggle(m, v)} />
      ),
    },
  ];
  return <DataTable columns={columns} rows={tenant.modules} getRowId={(m) => m.key} />;
}

// Explains dependency consequences up front instead of relying on the server's 409.
function ModuleToggleDialog({ tenant, toggle, onClose }: { tenant: TenantDetail; toggle: { module: TenantModule; enabled: boolean } | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const byKey = new Map(tenant.modules.map((m) => [m.key, m]));

  const alsoEnable: TenantModule[] = [];
  if (toggle?.enabled) {
    const visit = (key: ModuleKey) => {
      const m = byKey.get(key);
      if (!m || m.enabled || alsoEnable.includes(m)) return;
      m.depends_on.forEach(visit);
      alsoEnable.push(m);
    };
    toggle.module.depends_on.forEach(visit);
  }
  const blockedBy = toggle && !toggle.enabled ? tenant.modules.filter((m) => m.enabled && m.depends_on.includes(toggle.module.key)) : [];

  async function apply() {
    if (!toggle) return;
    const changes = [...alsoEnable.map((m) => ({ module_key: m.key, enabled: true })), { module_key: toggle.module.key, enabled: toggle.enabled }];
    await platformApi.setTenantModules(tenant.id, changes);
    await invalidateTenant(queryClient, tenant.id);
    toast.success(`${toggle.module.name} ${toggle.enabled ? "enabled" : "disabled"}.`);
  }

  return (
    <ConfirmDialog
      open={toggle !== null}
      onOpenChange={(open) => !open && onClose()}
      title={toggle ? `${toggle.enabled ? "Enable" : "Disable"} ${toggle.module.name}?` : ""}
      description={
        toggle &&
        (toggle.enabled
          ? alsoEnable.length
            ? `This also enables ${alsoEnable.map((m) => m.name).join(" and ")}, which ${toggle.module.name} needs.`
            : `${tenant.name} gets access to ${toggle.module.name} straight away.`
          : blockedBy.length
            ? `${blockedBy.map((m) => m.name).join(" and ")} still ${blockedBy.length > 1 ? "need" : "needs"} it. Disable ${blockedBy.length > 1 ? "those" : "that"} first.`
            : `${tenant.name} loses access to ${toggle.module.name}. Its data is kept, and comes back if you enable it again.`)
      }
      confirmLabel={toggle?.enabled ? "Enable" : "Disable"}
      destructive={toggle ? !toggle.enabled : false}
      confirmDisabled={blockedBy.length > 0}
      onConfirm={apply}
    />
  );
}

function RequestsTab({ tenantId, onFulfill }: { tenantId: string; onFulfill: (key: ModuleKey) => void }) {
  const [status, setStatus] = useState<ModuleRequestRow["status"]>("PENDING");
  const [dismissing, setDismissing] = useState<ModuleRequestRow | null>(null);
  const params = { tenant_id: tenantId, status };
  const query = useQuery({ queryKey: platformKeys.moduleRequests(params), queryFn: () => platformApi.listModuleRequests(params) });

  const columns: Column<ModuleRequestRow>[] = [
    { key: "module", header: "Module", cell: (r) => <span className="font-medium">{r.module_name}</span> },
    { key: "by", header: "Requested by", cell: (r) => r.requested_by_name ?? "—", className: "hidden md:table-cell" },
    { key: "note", header: "Note", cell: (r) => <span className="line-clamp-2 text-muted-foreground">{r.note ?? "—"}</span> },
    { key: "date", header: "Requested", cell: (r) => formatDate(r.created_at), className: "hidden sm:table-cell" },
    {
      key: "actions",
      header: <span className="sr-only">Actions</span>,
      cell: (r) =>
        r.status === "PENDING" ? (
          <div className="flex justify-end gap-2">
            <Button size="sm" onClick={() => onFulfill(r.module_key)}>
              Fulfill
            </Button>
            <Button size="sm" variant="outline" onClick={() => setDismissing(r)}>
              Dismiss
            </Button>
          </div>
        ) : (
          <StatusBadge status={r.status} />
        ),
    },
  ];

  return (
    <div className="space-y-3">
      <Select value={status} onValueChange={(v) => setStatus(v as ModuleRequestRow["status"])}>
        <SelectTrigger className="w-44" aria-label="Filter requests by status">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="PENDING">Pending</SelectItem>
          <SelectItem value="FULFILLED">Fulfilled</SelectItem>
          <SelectItem value="DISMISSED">Dismissed</SelectItem>
        </SelectContent>
      </Select>
      <DataTable
        columns={columns}
        rows={query.data?.items}
        getRowId={(r) => r.id}
        isLoading={query.isPending}
        error={query.error}
        onRetry={() => query.refetch()}
        empty={<EmptyState title={status === "PENDING" ? "No pending requests from this institute." : "Nothing here."} />}
      />
      <DismissRequestDialog request={dismissing} onClose={() => setDismissing(null)} />
    </div>
  );
}

function PaidUntilDialog({ tenant, open, onOpenChange }: { tenant: TenantDetail; open: boolean; onOpenChange: (open: boolean) => void }) {
  const queryClient = useQueryClient();
  const [date, setDate] = useState(tenant.paid_until ?? "");
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(next) => {
        if (next) setDate(tenant.paid_until ?? "");
        onOpenChange(next);
      }}
      title={`Paid-until date for ${tenant.name}`}
      description="For your records only: nothing is switched off when this date passes. Leave it empty to clear it."
      confirmLabel="Save"
      onConfirm={async () => {
        await platformApi.setTenantPaidUntil(tenant.id, date || null);
        await invalidateTenant(queryClient, tenant.id);
        toast.success(date ? "Paid-until date saved." : "Paid-until date cleared.");
      }}
    >
      <FormField id="paid-until" label="Paid until">
        <Input id="paid-until" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </FormField>
    </ConfirmDialog>
  );
}

function TransferOwnershipDialog({ tenant, open, onOpenChange }: { tenant: TenantDetail; open: boolean; onOpenChange: (open: boolean) => void }) {
  const queryClient = useQueryClient();
  const [userId, setUserId] = useState("");
  const users = useQuery({ queryKey: platformKeys.tenantUsers(tenant.id), queryFn: () => platformApi.listTenantUsers(tenant.id), enabled: open });
  const candidates = (users.data?.items ?? []).filter((u) => u.id !== tenant.owner_user_id && !u.banned);

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setUserId("");
        onOpenChange(next);
      }}
      title={`Transfer ownership of ${tenant.name}?`}
      description="The new Owner becomes the protected account no one at the institute can disable or demote. This can only be undone by transferring again. The current Owner keeps their role and access."
      confirmLabel="Transfer ownership"
      destructive
      confirmDisabled={!userId}
      onConfirm={async () => {
        await platformApi.transferOwnership(tenant.id, userId);
        await invalidateTenant(queryClient, tenant.id);
        toast.success("Ownership transferred.");
        setUserId("");
      }}
    >
      <FormField id="new-owner" required label="New Owner" hint={users.isSuccess && candidates.length === 0 ? "This institute has no other active users yet." : undefined}>
        <Select value={userId} onValueChange={setUserId} disabled={!candidates.length}>
          <SelectTrigger id="new-owner" className="w-full">
            <SelectValue placeholder={users.isPending ? "Loading users…" : "Choose a user"} />
          </SelectTrigger>
          <SelectContent>
            {candidates.map((u) => (
              <SelectItem key={u.id} value={u.id}>
                {u.name}
                {(u.email ?? u.username) && <span className="text-muted-foreground"> · {u.email ?? u.username}</span>}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>
    </ConfirmDialog>
  );
}
