import { eq, inArray } from "drizzle-orm";
import { MODULE_REGISTRY, moduleActivationOrder } from "../modules/registry";
import { PERMISSION_CATALOG } from "../rbac/catalog";
import { moduleDependencies, modules, permissions } from "./schema";
import type { Db } from "./types";

/**
 * Syncs modules, dependencies and permissions from code. Idempotent. Permissions removed from
 * the catalog are kept, since roles may still reference them.
 */
export async function seedPlatformCatalog(db: Db) {
  moduleActivationOrder(); // fail on a bad registry before touching the database

  return db.transaction(async (tx) => {
    const moduleIds = new Map<string, string>();
    for (const def of MODULE_REGISTRY) {
      const [existing] = await tx.select({ id: modules.id }).from(modules).where(eq(modules.key, def.key));
      if (existing) {
        await tx.update(modules).set({ name: def.name, tier: def.tier }).where(eq(modules.id, existing.id));
        moduleIds.set(def.key, existing.id);
      } else {
        const [created] = await tx
          .insert(modules)
          .values({ key: def.key, name: def.name, tier: def.tier })
          .returning({ id: modules.id });
        moduleIds.set(def.key, created.id);
      }
    }

    await tx.delete(moduleDependencies).where(inArray(moduleDependencies.moduleId, [...moduleIds.values()]));
    const depRows = MODULE_REGISTRY.flatMap((def) =>
      def.dependsOn.map((dep) => ({ moduleId: moduleIds.get(def.key)!, dependsOnModuleId: moduleIds.get(dep)! })),
    );
    if (depRows.length) await tx.insert(moduleDependencies).values(depRows);

    for (const perm of PERMISSION_CATALOG) {
      const moduleId = moduleIds.get(perm.module)!;
      const [existing] = await tx.select({ id: permissions.id }).from(permissions).where(eq(permissions.name, perm.name));
      if (existing) {
        await tx.update(permissions).set({ moduleId }).where(eq(permissions.id, existing.id));
      } else {
        await tx.insert(permissions).values({ name: perm.name, moduleId });
      }
    }

    return { modules: moduleIds.size, dependencies: depRows.length, permissions: PERMISSION_CATALOG.length };
  });
}
