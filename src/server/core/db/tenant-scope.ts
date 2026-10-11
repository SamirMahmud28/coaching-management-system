import { and, eq, type AnyColumn, type SQL } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { NotFoundError } from "../errors";
import type { DbOrTx } from "./types";

export type TenantTable = PgTable & { id: AnyColumn; tenantId: AnyColumn };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

export function tenantScope(table: TenantTable, tenantId: string, id?: string): SQL {
  return id ? and(eq(table.tenantId, tenantId), eq(table.id, id))! : eq(table.tenantId, tenantId);
}

/** Loads a record by (tenant_id, id). Another tenant's record and a malformed id are both a 404. */
export async function getInTenant<T extends TenantTable>(
  db: DbOrTx,
  table: T,
  tenantId: string,
  id: string,
  entity: string,
): Promise<T["$inferSelect"]> {
  if (!isUuid(id) || !isUuid(tenantId)) throw new NotFoundError(entity);
  const rows = await db
    .select()
    .from(table as PgTable)
    .where(tenantScope(table, tenantId, id))
    .limit(1);
  if (rows.length === 0) throw new NotFoundError(entity);
  return rows[0] as T["$inferSelect"];
}
