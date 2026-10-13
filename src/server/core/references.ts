import { InUseError, type ReferenceCount } from "./errors";
import type { DbOrTx } from "./db/types";

export type ReferenceCounter = (db: DbOrTx, tenantId: string, id: string) => Promise<number>;

/**
 * Delete guard for records other modules reference. Other modules register counters for their
 * own tables, so the owning module never queries them directly.
 */
export function createReferenceRegistry<Entity extends string>() {
  const counters = new Map<Entity, { type: string; count: ReferenceCounter }[]>();

  return {
    register(entity: Entity, type: string, count: ReferenceCounter) {
      const list = counters.get(entity) ?? [];
      if (list.some((c) => c.type === type)) {
        // The dev server's hot reload re-runs a module's registrations while the registry keeps the old ones: replace.
        if (process.env.NODE_ENV === "development") {
          counters.set(entity, [...list.filter((c) => c.type !== type), { type, count }]);
          return;
        }
        throw new Error(`Reference counter "${type}" is already registered for "${entity}"`);
      }
      counters.set(entity, [...list, { type, count }]);
    },

    /** Non-zero counts only. */
    async countReferences(db: DbOrTx, tenantId: string, entity: Entity, id: string): Promise<ReferenceCount[]> {
      const results = await Promise.all(
        (counters.get(entity) ?? []).map(async (c) => ({ type: c.type, count: await c.count(db, tenantId, id) })),
      );
      return results.filter((r) => r.count > 0);
    },

    async assertUnreferenced(db: DbOrTx, tenantId: string, entity: Entity, id: string): Promise<void> {
      const references = await this.countReferences(db, tenantId, entity, id);
      if (references.length > 0) throw new InUseError(entity, references);
    },
  };
}
