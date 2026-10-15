import type { AppTheme } from "@/lib/app-themes";
import { apiFetch } from "@/lib/api-client";
import type { ModuleKey } from "@/server/core/modules/registry";

export type { ModuleKey };

// Wire types, snake_case as the server sends them.

export type TenantStatus = "PENDING" | "ACTIVE" | "SUSPENDED" | "DEACTIVATED";

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}

export interface TenantListItem {
  id: string;
  name: string;
  subdomain: string;
  status: TenantStatus;
  owner_user_id: string | null;
  created_at: string;
  module_count: number;
}

export interface TenantModule {
  key: ModuleKey;
  name: string;
  always_on: boolean;
  depends_on: ModuleKey[];
  enabled: boolean;
}

export interface TenantDetail {
  id: string;
  name: string;
  subdomain: string;
  status: TenantStatus;
  owner_user_id: string | null;
  suspended_at: string | null;
  suspended_reason: string | null;
  deactivated_at: string | null;
  // Display only (D4), YYYY-MM-DD.
  paid_until: string | null;
  created_at: string;
  owner: { id: string; name: string; email: string | null } | null;
  modules: TenantModule[];
  /** The institute's app theme (D157); returned by the detail read. */
  app_theme?: AppTheme;
  /** null = automatic (on with Classic Amber) (D158). */
  paper_background?: boolean | null;
}

export interface TenantUser {
  id: string;
  name: string;
  email: string | null;
  username: string | null;
  banned: boolean;
}

export interface ModuleRequestRow {
  id: string;
  status: "PENDING" | "FULFILLED" | "DISMISSED";
  note: string | null;
  created_at: string;
  resolved_at: string | null;
  tenant_id: string;
  tenant_name: string;
  tenant_subdomain: string;
  module_key: ModuleKey;
  module_name: string;
  requested_by_name: string | null;
}

export interface PlatformAdmin {
  id: string;
  name: string;
  email: string;
  status: "ACTIVE" | "DISABLED";
  must_change_password: boolean;
  created_at: string;
}

export interface AuditRow {
  id: string;
  tenant_id: string | null;
  tenant_name: string | null;
  actor_type: "TENANT_USER" | "PLATFORM_USER";
  actor_name: string | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  timestamp: string;
}

export interface NewTenantInput {
  name: string;
  subdomain: string;
  starter_modules: ModuleKey[];
  owner_name: string;
  owner_email: string;
  temporary_password: string;
}

const base = "/api/platform";

export const platformApi = {
  // Better Auth endpoints take camelCase bodies.
  login: (email: string, password: string) =>
    apiFetch<{ user: { id: string; name: string; mustChangePassword: boolean } }>(`${base}/auth/login`, { body: { email, password } }),
  changePassword: (currentPassword: string, newPassword: string) =>
    apiFetch<{ success: boolean }>(`${base}/auth/platform/change-password`, { body: { currentPassword, newPassword } }),
  signOut: () => apiFetch<unknown>(`${base}/auth/sign-out`, { body: {} }),

  listTenants: (q: { q?: string; status?: TenantStatus; page?: number; page_size?: number }) =>
    apiFetch<Paginated<TenantListItem>>(`${base}/tenants`, { query: q }),
  checkSubdomain: (subdomain: string, signal?: AbortSignal) =>
    apiFetch<{ available: boolean; reason: "invalid" | "taken" | null }>(`${base}/tenants/check-subdomain`, { query: { subdomain }, signal }),
  createTenant: (input: NewTenantInput) =>
    apiFetch<{ tenant: TenantListItem; temporary_password: string }>(`${base}/tenants`, { body: input }),
  getTenant: (id: string) => apiFetch<TenantDetail>(`${base}/tenants/${id}`),
  listTenantUsers: (id: string) => apiFetch<{ items: TenantUser[] }>(`${base}/tenants/${id}/users`),
  setTenantStatus: (id: string, status: Exclude<TenantStatus, "PENDING">, reason?: string) =>
    apiFetch<TenantDetail>(`${base}/tenants/${id}/status`, { method: "PATCH", body: { status, reason } }),
  setTenantModules: (id: string, changes: { module_key: ModuleKey; enabled: boolean }[]) =>
    apiFetch<TenantDetail>(`${base}/tenants/${id}/modules`, { method: "PATCH", body: { changes } }),
  setTenantAppTheme: (id: string, theme: AppTheme, paper: boolean | null) =>
    apiFetch<{ app_theme: AppTheme; paper_background: boolean | null }>(`${base}/tenants/${id}/app-theme`, {
      method: "PATCH",
      body: { app_theme: theme, paper_background: paper },
    }),
  setMyAppTheme: (theme: AppTheme) => apiFetch<{ app_theme: AppTheme }>(`${base}/me/app-theme`, { method: "PATCH", body: { app_theme: theme } }),
  setTenantPaidUntil: (id: string, paidUntil: string | null) =>
    apiFetch<TenantDetail>(`${base}/tenants/${id}/paid-until`, { method: "PATCH", body: { paid_until: paidUntil } }),
  transferOwnership: (id: string, newOwnerUserId: string) =>
    apiFetch<TenantDetail>(`${base}/tenants/${id}/transfer-ownership`, { body: { new_owner_user_id: newOwnerUserId } }),

  listModuleRequests: (q: { status?: ModuleRequestRow["status"]; tenant_id?: string }) =>
    apiFetch<{ items: ModuleRequestRow[] }>(`${base}/module-requests`, { query: q }),
  dismissModuleRequest: (id: string, note: string) => apiFetch<unknown>(`${base}/module-requests/${id}/dismiss`, { body: { note } }),

  listAdmins: (q: { q?: string; status?: PlatformAdmin["status"] }) => apiFetch<{ items: PlatformAdmin[] }>(`${base}/admins`, { query: q }),
  createAdmin: (input: { name: string; email: string; temporary_password: string }) =>
    apiFetch<PlatformAdmin>(`${base}/admins`, { body: input }),
  setAdminStatus: (id: string, status: PlatformAdmin["status"]) =>
    apiFetch<PlatformAdmin>(`${base}/admins/${id}/status`, { method: "PATCH", body: { status } }),

  auditLog: (q: { tenant_id?: string; actor_type?: AuditRow["actor_type"]; action?: string; page?: number; page_size?: number }) =>
    apiFetch<Paginated<AuditRow>>(`${base}/audit-log`, { query: q }),
};
