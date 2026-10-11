import type { QueryClient } from "@tanstack/react-query";

export const platformKeys = {
  tenants: (params?: object) => (params ? ["platform-tenants", params] : ["platform-tenants"]),
  tenant: (id: string) => ["platform-tenant", id],
  tenantUsers: (id: string) => ["platform-tenant-users", id],
  demoRequests: (params?: object) => (params ? ["platform-demo-requests", params] : ["platform-demo-requests"]),
  moduleRequests: (params?: object) => (params ? ["platform-module-requests", params] : ["platform-module-requests"]),
  admins: (params?: object) => (params ? ["platform-admins", params] : ["platform-admins"]),
  audit: (params?: object) => (params ? ["platform-audit", params] : ["platform-audit"]),
};

export function invalidateTenant(client: QueryClient, id: string) {
  return Promise.all([
    client.invalidateQueries({ queryKey: platformKeys.tenant(id) }),
    client.invalidateQueries({ queryKey: platformKeys.tenants() }),
    client.invalidateQueries({ queryKey: platformKeys.moduleRequests() }),
    client.invalidateQueries({ queryKey: platformKeys.audit() }),
  ]);
}
