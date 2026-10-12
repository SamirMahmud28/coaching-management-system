import { inArray } from "drizzle-orm";
import { modules, tenantModules } from "../db/schema";
import type { DbOrTx } from "../db/types";
import type { ModuleKey } from "../modules/registry";

/** Switches paid modules on for an institute in tests (what the Super Admin's toggle does), or off with `enabled: false`. */
export async function setModules(db: DbOrTx, tenantId: string, keys: ModuleKey[], enabled = true) {
  const rows = await db.select({ id: modules.id }).from(modules).where(inArray(modules.key, keys));
  for (const { id } of rows) {
    await db
      .insert(tenantModules)
      .values({ tenantId, moduleId: id, enabled, enabledAt: enabled ? new Date() : null })
      .onConflictDoUpdate({ target: [tenantModules.tenantId, tenantModules.moduleId], set: { enabled, enabledAt: enabled ? new Date() : null } });
  }
}
