import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "../testing/db";
import { NotFoundError, mapDatabaseError } from "../errors";
import { tenants, userRoles, users } from "./schema";
import { getInTenant } from "./tenant-scope";
import { inTransaction } from "./transaction";

const { db, reset, close } = createTestDb();

async function twoTenantsWithAUser() {
  const [a, b] = await db
    .insert(tenants)
    .values([
      { name: "School A", subdomain: "school-a" },
      { name: "School B", subdomain: "school-b" },
    ])
    .returning();
  const [userA] = await db.insert(users).values({ tenantId: a.id, name: "User A", username: "user-a" }).returning();
  return { a, b, userA };
}

describe("shared core helpers (real database)", () => {
  beforeEach(async () => {
    await reset();
  });

  afterAll(async () => {
    await close();
  });

  describe("inTransaction", () => {
    it("commits when the function succeeds", async () => {
      await inTransaction(db, (tx) => tx.insert(tenants).values({ name: "Kept", subdomain: "kept" }));
      expect(await db.$count(tenants)).toBe(1);
    });

    it("rolls everything back when the function throws", async () => {
      await expect(
        inTransaction(db, async (tx) => {
          await tx.insert(tenants).values({ name: "Gone", subdomain: "gone" });
          throw new Error("fail midway");
        }),
      ).rejects.toThrow("fail midway");
      expect(await db.$count(tenants)).toBe(0);
    });

    it("joins the caller's transaction, so an inner failure undoes the outer work too", async () => {
      await expect(
        inTransaction(db, async (outer) => {
          await outer.insert(tenants).values({ name: "Outer", subdomain: "outer" });
          await inTransaction(outer, async (inner) => {
            await inner.insert(tenants).values({ name: "Inner", subdomain: "inner" });
            throw new Error("inner failure");
          });
        }),
      ).rejects.toThrow("inner failure");
      expect(await db.$count(tenants)).toBe(0);
    });
  });

  describe("getInTenant", () => {
    it("loads a record from its own tenant", async () => {
      const { a, userA } = await twoTenantsWithAUser();
      const found = await getInTenant(db, users, a.id, userA.id, "user");
      expect(found.id).toBe(userA.id);
    });

    it("returns 404 — not 403 — for another tenant's record", async () => {
      const { b, userA } = await twoTenantsWithAUser();
      const err = await getInTenant(db, users, b.id, userA.id, "user").catch((e) => e);
      expect(err).toBeInstanceOf(NotFoundError);
      expect(err.code).toBe("NOT_FOUND_USER");
    });

    it("returns 404 — not a database error — for a malformed id", async () => {
      const { a } = await twoTenantsWithAUser();
      await expect(getInTenant(db, users, a.id, "not-a-uuid", "user")).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe("mapDatabaseError against real PostgreSQL errors", () => {
    it("reads the constraint name through Drizzle's error wrapper", async () => {
      await db.insert(tenants).values({ name: "First", subdomain: "taken" });
      const raw = await db.insert(tenants).values({ name: "Second", subdomain: "TAKEN" }).catch((e) => e);
      const mapped = mapDatabaseError(raw, {
        entity: "tenant",
        operation: "write",
        unique: { tenants_subdomain_lower_idx: { code: "CONFLICT_TENANT_SUBDOMAIN", field: "subdomain" } },
      });
      expect(mapped?.code).toBe("CONFLICT_TENANT_SUBDOMAIN");
      expect(mapped?.details).toEqual({ field: "subdomain" });
    });

    it("maps a cross-tenant composite-FK violation to 404", async () => {
      const { b, userA } = await twoTenantsWithAUser();
      // Tenant B's row pointing at tenant A's user: the composite FK refuses it.
      const raw = await db
        .insert(userRoles)
        .values({ tenantId: b.id, userId: userA.id, roleId: crypto.randomUUID() })
        .catch((e) => e);
      expect(mapDatabaseError(raw, { entity: "user role", operation: "write" })?.status).toBe(404);
    });
  });
});
