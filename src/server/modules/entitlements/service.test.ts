import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "../../core/testing/db";
import { moduleRequests, modules as modulesTable, platformUsers, tenantModules, tenants, users } from "../../core/db/schema";
import type { Db } from "../../core/db/types";
import { seedPlatformCatalog } from "../../core/db/seed";
import {
  createModuleRequest,
  dismissModuleRequest,
  instituteModuleOverview,
  isModuleActive,
  listActiveModules,
  listModuleRequests,
  setTenantModules,
} from "./service";

const { db: testDb, reset, close } = createTestDb();
const db = testDb as unknown as Db;
// enabled_by / resolved_by are real FKs to platform_users — seeded fresh each test.
let PLATFORM_USER_ID: string;

beforeEach(async () => {
  await reset();
  await seedPlatformCatalog(testDb);
  const [platformUser] = await testDb.insert(platformUsers).values({ name: "Platform Admin", email: "admin@platform.test" }).returning();
  PLATFORM_USER_ID = platformUser.id;
});

afterAll(async () => {
  await close();
});

async function seedTenantRow(subdomain: string) {
  const [tenant] = await testDb.insert(tenants).values({ name: subdomain, subdomain, status: "ACTIVE" }).returning();
  return tenant;
}

async function seedUser(tenantId: string, name = "Owner") {
  const [user] = await testDb.insert(users).values({ tenantId, name, email: `${name.toLowerCase().replace(/\s/g, "")}-${tenantId.slice(0, 8)}@inst.test` }).returning();
  return user;
}

const set = (tenantId: string, changes: { key: "core" | "fees" | "exams" | "attendance" | "routine" | "website"; enabled: boolean }[]) =>
  setTenantModules(db, { tenantId, changes, platformUserId: PLATFORM_USER_ID });

describe("listActiveModules (real database)", () => {
  it("lists Core plus enabled modules, in registry order, and not disabled ones", async () => {
    const tenant = await seedTenantRow("inst-a");
    expect(await listActiveModules(db, tenant.id)).toEqual(["core"]);

    await set(tenant.id, [{ key: "fees", enabled: true }, { key: "attendance", enabled: true }]);
    await set(tenant.id, [{ key: "fees", enabled: false }]);
    expect(await listActiveModules(db, tenant.id)).toEqual(["core", "attendance"]);
  });

  it("never mixes up two institutes' modules", async () => {
    const a = await seedTenantRow("inst-a");
    const b = await seedTenantRow("inst-b");
    await set(a.id, [{ key: "exams", enabled: true }]);
    expect(await listActiveModules(db, b.id)).toEqual(["core"]);
  });
});

describe("isModuleActive (real database)", () => {
  it("is always true for Core, with no tenant_modules row", async () => {
    const tenant = await seedTenantRow("inst-a");
    expect(await isModuleActive(db, tenant.id, "core")).toBe(true);
  });

  it("is false for a paid module with no tenant_modules row, and true once switched on", async () => {
    const tenant = await seedTenantRow("inst-a");
    expect(await isModuleActive(db, tenant.id, "fees")).toBe(false);
    await set(tenant.id, [{ key: "fees", enabled: true }]);
    expect(await isModuleActive(db, tenant.id, "fees")).toBe(true);
  });
});

describe("setTenantModules (real database)", () => {
  it("switches a paid module off without deleting anything: the row stays, so re-enabling restores it", async () => {
    const tenant = await seedTenantRow("inst-a");
    await set(tenant.id, [{ key: "fees", enabled: true }]);
    await set(tenant.id, [{ key: "fees", enabled: false }]);
    const rows = await testDb.select().from(tenantModules).where(eq(tenantModules.tenantId, tenant.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ enabled: false });
    expect(rows[0].enabledAt).not.toBeNull(); // when it was last switched on is kept
  });

  it("refuses to turn off Core", async () => {
    const tenant = await seedTenantRow("inst-a");
    await expect(set(tenant.id, [{ key: "core", enabled: false }])).rejects.toMatchObject({ code: "CONFLICT_MODULE_ALWAYS_ON" });
  });

  it("is a no-op for an empty batch", async () => {
    const tenant = await seedTenantRow("inst-a");
    await set(tenant.id, []);
    expect(await listActiveModules(db, tenant.id)).toEqual(["core"]);
  });

  it("auto-fulfils a matching pending module request when the module is switched on", async () => {
    const tenant = await seedTenantRow("inst-a");
    const owner = await seedUser(tenant.id);
    const request = await createModuleRequest(db, { tenantId: tenant.id, moduleKey: "fees", requestedBy: owner.id });

    await set(tenant.id, [{ key: "fees", enabled: true }]);

    const [updated] = await testDb.select().from(moduleRequests).where(eq(moduleRequests.id, request.id));
    expect(updated.status).toBe("FULFILLED");
    expect(updated.resolvedBy).toBe(PLATFORM_USER_ID);
  });
});

describe("module requests (real database)", () => {
  it("creates a request", async () => {
    const tenant = await seedTenantRow("inst-a");
    const owner = await seedUser(tenant.id);
    const request = await createModuleRequest(db, { tenantId: tenant.id, moduleKey: "fees", requestedBy: owner.id, note: "Please" });
    expect(request.status).toBe("PENDING");
    expect(request.note).toBe("Please");
  });

  it("rejects a duplicate pending request for the same module", async () => {
    const tenant = await seedTenantRow("inst-a");
    const owner = await seedUser(tenant.id);
    await createModuleRequest(db, { tenantId: tenant.id, moduleKey: "fees", requestedBy: owner.id });
    await expect(createModuleRequest(db, { tenantId: tenant.id, moduleKey: "fees", requestedBy: owner.id })).rejects.toMatchObject({
      code: "CONFLICT_MODULE_REQUEST_EXISTS",
    });
  });

  it("returns 404 for a requester from another institute", async () => {
    const tenant = await seedTenantRow("inst-a");
    const tenantB = await seedTenantRow("inst-b");
    const userB = await seedUser(tenantB.id, "User B");
    await expect(createModuleRequest(db, { tenantId: tenant.id, moduleKey: "fees", requestedBy: userB.id })).rejects.toMatchObject({
      code: "NOT_FOUND_USER",
    });
  });

  it("lists requests filtered by institute and status", async () => {
    const tenant = await seedTenantRow("inst-a");
    const owner = await seedUser(tenant.id);
    await createModuleRequest(db, { tenantId: tenant.id, moduleKey: "fees", requestedBy: owner.id });
    await createModuleRequest(db, { tenantId: tenant.id, moduleKey: "exams", requestedBy: owner.id });
    expect(await listModuleRequests(db, { tenantId: tenant.id })).toHaveLength(2);
    expect(await listModuleRequests(db, { tenantId: tenant.id, status: "PENDING" })).toHaveLength(2);
  });

  it("dismisses a pending request, and refuses to dismiss it twice", async () => {
    const tenant = await seedTenantRow("inst-a");
    const owner = await seedUser(tenant.id);
    const request = await createModuleRequest(db, { tenantId: tenant.id, moduleKey: "fees", requestedBy: owner.id });

    const dismissed = await dismissModuleRequest(db, { requestId: request.id, platformUserId: PLATFORM_USER_ID });
    expect(dismissed.status).toBe("DISMISSED");
    expect(dismissed.resolvedBy).toBe(PLATFORM_USER_ID);
    await expect(dismissModuleRequest(db, { requestId: request.id, platformUserId: PLATFORM_USER_ID })).rejects.toMatchObject({
      code: "CONFLICT_MODULE_REQUEST_RESOLVED",
    });
  });
});

describe("instituteModuleOverview (real database)", () => {
  it("marks a module pending when a request is open, and not once fulfilled", async () => {
    const tenant = await seedTenantRow("inst-a");
    const owner = await seedUser(tenant.id);
    await createModuleRequest(db, { tenantId: tenant.id, moduleKey: "fees", requestedBy: owner.id });

    const before = await instituteModuleOverview(db, tenant.id);
    expect(before.find((m) => m.key === "fees")).toMatchObject({ enabled: false, pendingRequest: true });
    expect(before.find((m) => m.key === "core")).toMatchObject({ enabled: true, pendingRequest: false });

    await set(tenant.id, [{ key: "fees", enabled: true }]);
    const after = await instituteModuleOverview(db, tenant.id);
    expect(after.find((m) => m.key === "fees")).toMatchObject({ enabled: true, pendingRequest: false });
  });
});

describe("module_requests schema", () => {
  it("refuses a requester from another institute at the database level", async () => {
    const a = await seedTenantRow("fk-a");
    const b = await seedTenantRow("fk-b");
    const userB = await seedUser(b.id, "B user");
    const [feesModule] = await testDb.select().from(modulesTable).where(eq(modulesTable.key, "fees"));
    await expect(testDb.insert(moduleRequests).values({ tenantId: a.id, moduleId: feesModule.id, requestedBy: userB.id })).rejects.toThrow();
  });
});
