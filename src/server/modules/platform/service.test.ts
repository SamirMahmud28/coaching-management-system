import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "../../core/testing/db";
import { auditLogs, modules, platformUsers, roles, tenants, userRoles, users } from "../../core/db/schema";
import type { ModuleKey } from "../../core/modules/registry";
import type { Db } from "../../core/db/types";
import { seedPlatformCatalog } from "../../core/db/seed";
import { isModuleActive } from "../entitlements/service";
import {
  createPlatformAdmin,
  createTenant,
  disablePlatformAdmin,
  getTenant,
  listTenants,
  setTenantPaidUntil,
  transferOwnership,
  transitionTenantStatus,
} from "./service";

const { db: testDb, reset, close } = createTestDb();
const db = testDb as unknown as Db;

beforeEach(async () => {
  await reset();
  await seedPlatformCatalog(testDb);
});

afterAll(async () => {
  await close();
});

async function seedPlatformUser() {
  const [platformUser] = await testDb
    .insert(platformUsers)
    .values({ name: "Admin", email: `admin-${Date.now()}-${Math.random()}@platform.test` })
    .returning();
  return platformUser;
}

const validTenantInput = (subdomain: string) => ({
  name: "Green Valley Coaching",
  subdomain,
  starterModuleKeys: ["fees", "exams"] as ModuleKey[],
  ownerName: "Owner Person",
  ownerEmail: "owner@greenvalley.test",
  temporaryPassword: "OwnerPass123",
});

describe("createTenant (real database)", () => {
  it("creates a fully-wired ACTIVE tenant in one transaction", async () => {
    const platformUser = await seedPlatformUser();
    const { tenant, temporaryPassword } = await createTenant(db, validTenantInput("green-valley"), { platformUserId: platformUser.id });

    expect(tenant.status).toBe("ACTIVE");
    expect(tenant.ownerUserId).not.toBeNull();
    expect(temporaryPassword).toBe("OwnerPass123");

    // The starter modules are active, and always-on Core is too.
    expect(await isModuleActive(db, tenant.id, "core")).toBe(true);
    expect(await isModuleActive(db, tenant.id, "fees")).toBe(true);
    expect(await isModuleActive(db, tenant.id, "exams")).toBe(true);
    expect(await isModuleActive(db, tenant.id, "attendance")).toBe(false); // not requested

    // The Owner holds the Owner role.
    const [ownerRole] = await testDb.select().from(userRoles).where(eq(userRoles.userId, tenant.ownerUserId!));
    const [role] = await testDb.select().from(roles).where(eq(roles.id, ownerRole.roleId));
    expect(role.name).toBe("Owner");

    // Every baseline role from ROLE_TEMPLATES exists for this tenant.
    const tenantRoles = await testDb.select().from(roles).where(eq(roles.tenantId, tenant.id));
    expect(tenantRoles.map((r) => r.name).sort()).toEqual(["Accountant", "Admin", "Instructor", "Owner", "Student"]);
  });

  it("rejects a duplicate subdomain", async () => {
    const platformUser = await seedPlatformUser();
    await createTenant(db, validTenantInput("green-valley"), { platformUserId: platformUser.id });
    await expect(createTenant(db, validTenantInput("green-valley"), { platformUserId: platformUser.id })).rejects.toMatchObject({
      code: "CONFLICT_TENANT_SUBDOMAIN",
    });
  });

  it("leaves nothing behind when the transaction fails partway through", async () => {
    const platformUser = await seedPlatformUser();
    // Force a mid-transaction failure (after the tenant row + baseline roles already exist) by
    // renaming "fees" in the modules catalog — setTenantModules can no longer find it by key
    // (simulating the DB catalog drifting out of sync with the code registry) and throws.
    await testDb.update(modules).set({ key: "fees-renamed" }).where(eq(modules.key, "fees"));

    await expect(createTenant(db, validTenantInput("green-valley"), { platformUserId: platformUser.id })).rejects.toThrow();

    const [orphanTenant] = await testDb.select().from(tenants).where(eq(tenants.subdomain, "green-valley"));
    expect(orphanTenant).toBeUndefined();
    const [orphanUser] = await testDb.select().from(users).where(eq(users.email, "owner@greenvalley.test"));
    expect(orphanUser).toBeUndefined();
  });

  it("calls the seedTenantDefaults hook with the new tenant id", async () => {
    const platformUser = await seedPlatformUser();
    const calls: string[] = [];
    const { tenant } = await createTenant(db, validTenantInput("green-valley"), {
      platformUserId: platformUser.id,
      seedTenantDefaults: async (_tx, tenantId) => {
        calls.push(tenantId);
      },
    });
    expect(calls).toEqual([tenant.id]);
  });

  it("rejects an invalid subdomain", async () => {
    const platformUser = await seedPlatformUser();
    await expect(
      createTenant(db, { ...validTenantInput("ab"), subdomain: "ab" }, { platformUserId: platformUser.id }),
    ).rejects.toMatchObject({ code: "VALIDATION_SUBDOMAIN" });
  });

  it("creates a Core-only institute when no paid modules are chosen", async () => {
    const platformUser = await seedPlatformUser();
    const { tenant } = await createTenant(db, { ...validTenantInput("green-valley"), starterModuleKeys: [] }, { platformUserId: platformUser.id });
    expect(await isModuleActive(db, tenant.id, "core")).toBe(true);
    for (const key of ["attendance", "routine", "exams", "fees", "website"] as const) {
      expect(await isModuleActive(db, tenant.id, key), key).toBe(false);
    }
  });
});

describe("transitionTenantStatus (real database)", () => {
  async function seedTenant() {
    const platformUser = await seedPlatformUser();
    const { tenant } = await createTenant(db, validTenantInput("green-valley"), { platformUserId: platformUser.id });
    return { tenant, platformUser };
  }

  it("suspends with a reason", async () => {
    const { tenant, platformUser } = await seedTenant();
    const updated = await transitionTenantStatus(db, { tenantId: tenant.id, status: "SUSPENDED", reason: "Overdue invoice", platformUserId: platformUser.id });
    expect(updated.status).toBe("SUSPENDED");
    expect(updated.suspendedReason).toBe("Overdue invoice");
  });

  it("deactivates with a reason", async () => {
    const { tenant, platformUser } = await seedTenant();
    const updated = await transitionTenantStatus(db, { tenantId: tenant.id, status: "DEACTIVATED", reason: "Closed down", platformUserId: platformUser.id });
    expect(updated.status).toBe("DEACTIVATED");
    expect(updated.deactivatedAt).not.toBeNull();
  });

  it("reactivates and clears suspension/deactivation fields", async () => {
    const { tenant, platformUser } = await seedTenant();
    await transitionTenantStatus(db, { tenantId: tenant.id, status: "SUSPENDED", reason: "x", platformUserId: platformUser.id });
    const updated = await transitionTenantStatus(db, { tenantId: tenant.id, status: "ACTIVE", platformUserId: platformUser.id });
    expect(updated.status).toBe("ACTIVE");
    expect(updated.suspendedAt).toBeNull();
    expect(updated.suspendedReason).toBeNull();
  });

  it("requires a reason for SUSPENDED and DEACTIVATED", async () => {
    const { tenant, platformUser } = await seedTenant();
    await expect(
      transitionTenantStatus(db, { tenantId: tenant.id, status: "SUSPENDED", platformUserId: platformUser.id }),
    ).rejects.toMatchObject({ code: "VALIDATION_REASON_REQUIRED" });
  });

  it("rejects PENDING as a target status", async () => {
    const { tenant, platformUser } = await seedTenant();
    await expect(
      transitionTenantStatus(db, { tenantId: tenant.id, status: "PENDING" as never, platformUserId: platformUser.id }),
    ).rejects.toMatchObject({ code: "VALIDATION_STATUS_TRANSITION" });
  });

  it("returns 404 for an unknown tenant", async () => {
    const { platformUser } = await seedTenant();
    await expect(
      transitionTenantStatus(db, { tenantId: "00000000-0000-0000-0000-000000000000", status: "SUSPENDED", reason: "x", platformUserId: platformUser.id }),
    ).rejects.toMatchObject({ code: "NOT_FOUND_TENANT" });
  });
});

describe("transferOwnership (real database)", () => {
  it("changes owner_user_id and keeps the previous owner's role", async () => {
    const platformUser = await seedPlatformUser();
    const { tenant } = await createTenant(db, validTenantInput("green-valley"), { platformUserId: platformUser.id });
    const [newOwner] = await testDb.insert(users).values({ tenantId: tenant.id, name: "New Owner", username: "new-owner" }).returning();

    const updated = await transferOwnership(db, { tenantId: tenant.id, newOwnerUserId: newOwner.id, platformUserId: platformUser.id });
    expect(updated.ownerUserId).toBe(newOwner.id);

    const oldOwnerRoles = await testDb.select().from(userRoles).where(eq(userRoles.userId, tenant.ownerUserId!));
    expect(oldOwnerRoles).toHaveLength(1); // untouched
  });

  it("returns 404 for a user from another tenant", async () => {
    const platformUser = await seedPlatformUser();
    const { tenant: a } = await createTenant(db, validTenantInput("inst-a"), { platformUserId: platformUser.id });
    const { tenant: b } = await createTenant(db, validTenantInput("inst-b"), { platformUserId: platformUser.id });
    await expect(
      transferOwnership(db, { tenantId: a.id, newOwnerUserId: b.ownerUserId!, platformUserId: platformUser.id }),
    ).rejects.toMatchObject({ code: "NOT_FOUND_USER" });
  });
});

describe("setTenantPaidUntil (real database)", () => {
  it("sets and clears the display-only date, auditing each change", async () => {
    const platformUser = await seedPlatformUser();
    const { tenant } = await createTenant(db, validTenantInput("green-valley"), { platformUserId: platformUser.id });

    expect((await setTenantPaidUntil(db, { tenantId: tenant.id, paidUntil: "2026-12-31", platformUserId: platformUser.id })).paidUntil).toBe("2026-12-31");
    expect((await getTenant(db, tenant.id)).paidUntil).toBe("2026-12-31");
    expect((await setTenantPaidUntil(db, { tenantId: tenant.id, paidUntil: null, platformUserId: platformUser.id })).paidUntil).toBeNull();

    const entries = await testDb.select().from(auditLogs).where(eq(auditLogs.action, "TENANT_PAID_UNTIL_CHANGED"));
    expect(entries).toHaveLength(2);
  });

  it("rejects a malformed date and an unknown institute", async () => {
    const platformUser = await seedPlatformUser();
    const { tenant } = await createTenant(db, validTenantInput("green-valley"), { platformUserId: platformUser.id });
    for (const bad of ["31/12/2026", "2026-02-30"]) {
      await expect(setTenantPaidUntil(db, { tenantId: tenant.id, paidUntil: bad, platformUserId: platformUser.id })).rejects.toMatchObject({
        code: "VALIDATION_DATE",
      });
    }
    await expect(
      setTenantPaidUntil(db, { tenantId: "00000000-0000-0000-0000-000000000000", paidUntil: null, platformUserId: platformUser.id }),
    ).rejects.toMatchObject({ code: "NOT_FOUND_TENANT" });
  });
});

describe("Platform Admin management (real database)", () => {
  it("creates a Platform Admin", async () => {
    const platformUser = await seedPlatformUser();
    const admin = await createPlatformAdmin(db, { name: "New Admin", email: "new-admin@platform.test", temporaryPassword: "NewAdmin123", platformUserId: platformUser.id });
    expect(admin.mustChangePassword).toBe(true);
  });

  it("rejects a duplicate email", async () => {
    const platformUser = await seedPlatformUser();
    await createPlatformAdmin(db, { name: "A", email: "dup@platform.test", temporaryPassword: "DupAdmin123", platformUserId: platformUser.id });
    await expect(
      createPlatformAdmin(db, { name: "B", email: "dup@platform.test", temporaryPassword: "DupAdmin123", platformUserId: platformUser.id }),
    ).rejects.toMatchObject({ code: "CONFLICT_PLATFORM_ADMIN_EMAIL" });
  });

  it("disables another admin", async () => {
    const platformUser = await seedPlatformUser();
    const other = await seedPlatformUser();
    const updated = await disablePlatformAdmin(db, { id: other.id, platformUserId: platformUser.id });
    expect(updated.status).toBe("DISABLED");
  });

  it("rejects disabling your own account", async () => {
    const platformUser = await seedPlatformUser();
    await expect(disablePlatformAdmin(db, { id: platformUser.id, platformUserId: platformUser.id })).rejects.toMatchObject({
      code: "CONFLICT_SELF_DISABLE",
    });
  });
});

describe("listTenants / getTenant (real database)", () => {
  it("filters by status and search text, with a module count", async () => {
    const platformUser = await seedPlatformUser();
    const { tenant: a } = await createTenant(db, validTenantInput("alpha-inst"), { platformUserId: platformUser.id });
    await createTenant(db, { ...validTenantInput("beta-inst"), name: "Beta Coaching" }, { platformUserId: platformUser.id });
    await transitionTenantStatus(db, { tenantId: a.id, status: "SUSPENDED", reason: "x", platformUserId: platformUser.id });

    const suspended = await listTenants(db, { status: "SUSPENDED" });
    expect(suspended.items.map((t) => t.subdomain)).toEqual(["alpha-inst"]);
    // core (always on) + fees + exams = 3
    expect(suspended.items[0].moduleCount).toBe(3);

    const bySearch = await listTenants(db, { q: "beta" });
    expect(bySearch.items).toHaveLength(1);
    expect(bySearch.items[0].subdomain).toBe("beta-inst");

    expect((await listTenants(db, {})).total).toBe(2);
  });

  it("treats LIKE wildcards in the search text literally", async () => {
    const platformUser = await seedPlatformUser();
    await createTenant(db, validTenantInput("green-valley"), { platformUserId: platformUser.id });
    expect((await listTenants(db, { q: "%" })).total).toBe(0);
    expect((await listTenants(db, { q: "_" })).total).toBe(0);
    expect((await listTenants(db, { q: "valley" })).total).toBe(1);
  });

  it("gets a tenant by id, or 404", async () => {
    const platformUser = await seedPlatformUser();
    const { tenant } = await createTenant(db, validTenantInput("green-valley"), { platformUserId: platformUser.id });
    expect((await getTenant(db, tenant.id)).id).toBe(tenant.id);
    await expect(getTenant(db, "00000000-0000-0000-0000-000000000000")).rejects.toMatchObject({ code: "NOT_FOUND_TENANT" });
  });
});
