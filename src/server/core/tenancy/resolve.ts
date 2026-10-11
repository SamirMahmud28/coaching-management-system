import { eq, sql } from "drizzle-orm";
import { tenants } from "../db/schema";
import type { DbOrTx } from "../db/types";
import { classifyHost, type HostConfig } from "./host";

export type Tenant = typeof tenants.$inferSelect;

export type ResolvedHost =
  | { kind: "platform" }
  | { kind: "tenant"; tenant: Tenant }
  | { kind: "root" }
  // All unknown cases look the same, so the page never confirms whether an institute exists.
  | { kind: "not-found" };

export async function findTenantBySubdomain(db: DbOrTx, subdomain: string): Promise<Tenant | null> {
  const rows = await db
    .select()
    .from(tenants)
    .where(eq(sql`lower(${tenants.subdomain})`, subdomain.toLowerCase()))
    .limit(1);
  return rows[0] ?? null;
}

/** The request's tenant, always from the Host header. Status is enforced by the authorization chain. */
export async function resolveHost(db: DbOrTx, rawHost: string | null | undefined, config: HostConfig): Promise<ResolvedHost> {
  const host = classifyHost(rawHost, config);
  switch (host.kind) {
    case "platform":
    case "root":
      return host;
    case "unknown":
      return { kind: "not-found" };
    case "tenant": {
      const tenant = await findTenantBySubdomain(db, host.subdomain);
      return tenant ? { kind: "tenant", tenant } : { kind: "not-found" };
    }
  }
}
