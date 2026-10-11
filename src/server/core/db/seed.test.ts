import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "../testing/db";
import { MODULE_REGISTRY } from "../modules/registry";
import { PERMISSION_CATALOG } from "../rbac/catalog";
import { moduleDependencies, modules, permissions } from "./schema";
import { seedPlatformCatalog } from "./seed";

const { db, reset, close } = createTestDb();

describe("seedPlatformCatalog", () => {
  beforeEach(async () => {
    await reset();
  });

  afterAll(async () => {
    await close();
  });

  it("creates every module, dependency and permission from the code catalogs", async () => {
    await seedPlatformCatalog(db);

    expect(await db.$count(modules)).toBe(MODULE_REGISTRY.length);
    expect(await db.$count(permissions)).toBe(PERMISSION_CATALOG.length);
    const expectedDeps = MODULE_REGISTRY.reduce((n, m) => n + m.dependsOn.length, 0);
    expect(await db.$count(moduleDependencies)).toBe(expectedDeps);
  });

  it("is idempotent — a second run creates no duplicates", async () => {
    await seedPlatformCatalog(db);
    await seedPlatformCatalog(db);

    expect(await db.$count(modules)).toBe(MODULE_REGISTRY.length);
    expect(await db.$count(permissions)).toBe(PERMISSION_CATALOG.length);
    expect(await db.$count(moduleDependencies)).toBe(MODULE_REGISTRY.reduce((n, m) => n + m.dependsOn.length, 0));
  });

  it("stores each paid module's single dependency on Core", async () => {
    await seedPlatformCatalog(db);
    const rows = await db
      .select({ dependsOn: modules.key })
      .from(moduleDependencies)
      .innerJoin(modules, eq(modules.id, moduleDependencies.dependsOnModuleId))
      .where(eq(moduleDependencies.moduleId, db.select({ id: modules.id }).from(modules).where(eq(modules.key, "fees"))));
    expect(rows.map((r) => r.dependsOn)).toEqual(["core"]);
  });

  it("links every permission to the module that owns it", async () => {
    await seedPlatformCatalog(db);
    const rows = await db
      .select({ name: permissions.name, moduleKey: modules.key })
      .from(permissions)
      .leftJoin(modules, eq(modules.id, permissions.moduleId));
    const byName = Object.fromEntries(rows.map((r) => [r.name, r.moduleKey]));
    expect(byName["students.view"]).toBe("core");
    expect(byName["audit.view"]).toBe("core");
    expect(byName["fees.view"]).toBe("fees");
    expect(Object.values(byName)).not.toContain(null);
  });
});
