import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "../../core/testing/db";
import { platformUsers, tenants, users } from "../../core/db/schema";
import type { Db } from "../../core/db/types";
import { audit, queryPlatformAuditLog, queryTenantAuditLog, redactSecrets } from "./service";

const { db: testDb, reset, close } = createTestDb();
const db = testDb as unknown as Db;

beforeEach(async () => {
  await reset();
});

afterAll(async () => {
  await close();
});

async function seedTenant(subdomain: string) {
  const [tenant] = await testDb.insert(tenants).values({ name: subdomain, subdomain, status: "ACTIVE" }).returning();
  const [user] = await testDb.insert(users).values({ tenantId: tenant.id, name: "User", username: `user-${tenant.subdomain}` }).returning();
  return { tenant, user };
}

async function seedPlatformUser() {
  const [platformUser] = await testDb.insert(platformUsers).values({ name: "Admin", email: `admin-${Date.now()}@platform.test` }).returning();
  return platformUser;
}

describe("redactSecrets (pure)", () => {
  it("replaces values whose key looks like a secret", () => {
    const input = { name: "Owner", password: "hunter2", passwordHash: "$argon2id$...", token: "abc", note: "fine" };
    expect(redactSecrets(input)).toEqual({
      name: "Owner",
      password: "[REDACTED]",
      passwordHash: "[REDACTED]",
      token: "[REDACTED]",
      note: "fine",
    });
  });

  it("redacts nested objects and arrays too", () => {
    const input = { account: { secret: "shh" }, items: [{ apiKey: "xyz" }, { name: "ok" }] };
    expect(redactSecrets(input)).toEqual({ account: { secret: "[REDACTED]" }, items: [{ apiKey: "[REDACTED]" }, { name: "ok" }] });
  });

  it("leaves values with no sensitive keys untouched", () => {
    const input = { a: 1, b: "two", c: null };
    expect(redactSecrets(input)).toEqual(input);
  });
});

describe("audit.record (real database)", () => {
  it("records a tenant-user action", async () => {
    const { tenant, user } = await seedTenant("school-a");
    const entry = await audit.record(db, {
      tenantId: tenant.id,
      actorType: "TENANT_USER",
      userId: user.id,
      action: "STUDENT_CREATED",
      resourceType: "STUDENT",
    });
    expect(entry.actorType).toBe("TENANT_USER");
    expect(entry.userId).toBe(user.id);
    expect(entry.platformUserId).toBeNull();
  });

  it("records a platform-user action with no tenant target", async () => {
    const platformUser = await seedPlatformUser();
    const entry = await audit.record(db, {
      actorType: "PLATFORM_USER",
      platformUserId: platformUser.id,
      action: "PLATFORM_ADMIN_CREATED",
      resourceType: "PLATFORM_USER",
    });
    expect(entry.tenantId).toBeNull();
    expect(entry.platformUserId).toBe(platformUser.id);
    expect(entry.userId).toBeNull();
  });

  it("redacts secret-looking fields in old/new values before storing", async () => {
    const { tenant, user } = await seedTenant("school-a");
    const entry = await audit.record(db, {
      tenantId: tenant.id,
      actorType: "TENANT_USER",
      userId: user.id,
      action: "LOGIN_RESET",
      resourceType: "USER",
      newValue: { password: "hunter2", mustChangePassword: true },
    });
    expect(entry.newValue).toEqual({ password: "[REDACTED]", mustChangePassword: true });
  });

  it("rejects a TENANT_USER entry with no userId", async () => {
    const { tenant } = await seedTenant("school-a");
    await expect(
      audit.record(db, { tenantId: tenant.id, actorType: "TENANT_USER", action: "X", resourceType: "Y" }),
    ).rejects.toThrow();
  });

  it("rejects a TENANT_USER entry that also sets platformUserId", async () => {
    const { tenant, user } = await seedTenant("school-a");
    const platformUser = await seedPlatformUser();
    await expect(
      audit.record(db, {
        tenantId: tenant.id,
        actorType: "TENANT_USER",
        userId: user.id,
        platformUserId: platformUser.id,
        action: "X",
        resourceType: "Y",
      }),
    ).rejects.toThrow();
  });

  it("rejects a PLATFORM_USER entry with no platformUserId", async () => {
    await expect(audit.record(db, { actorType: "PLATFORM_USER", action: "X", resourceType: "Y" })).rejects.toThrow();
  });

  it("rejects a PLATFORM_USER entry that sets userId instead", async () => {
    const { user } = await seedTenant("school-a");
    await expect(
      audit.record(db, { actorType: "PLATFORM_USER", userId: user.id, action: "X", resourceType: "Y" }),
    ).rejects.toThrow();
  });
});

describe("queryTenantAuditLog (real database)", () => {
  it("never returns another tenant's rows", async () => {
    const { tenant: a, user: userA } = await seedTenant("school-a");
    const { tenant: b, user: userB } = await seedTenant("school-b");
    await audit.record(db, { tenantId: a.id, actorType: "TENANT_USER", userId: userA.id, action: "X", resourceType: "Y" });
    await audit.record(db, { tenantId: b.id, actorType: "TENANT_USER", userId: userB.id, action: "X", resourceType: "Y" });

    const result = await queryTenantAuditLog(db, { tenantId: a.id });
    expect(result.items).toHaveLength(1);
    expect(result.items.every((row) => row.tenantId === a.id)).toBe(true);
    expect(result.total).toBe(1);
  });

  it("filters by action", async () => {
    const { tenant, user } = await seedTenant("school-a");
    await audit.record(db, { tenantId: tenant.id, actorType: "TENANT_USER", userId: user.id, action: "STUDENT_CREATED", resourceType: "STUDENT" });
    await audit.record(db, { tenantId: tenant.id, actorType: "TENANT_USER", userId: user.id, action: "STUDENT_UPDATED", resourceType: "STUDENT" });

    const result = await queryTenantAuditLog(db, { tenantId: tenant.id, action: "STUDENT_CREATED" });
    expect(result.items).toHaveLength(1);
    expect(result.items[0].action).toBe("STUDENT_CREATED");
  });

  it("paginates, newest first", async () => {
    const { tenant, user } = await seedTenant("school-a");
    for (let i = 0; i < 5; i++) {
      await audit.record(db, { tenantId: tenant.id, actorType: "TENANT_USER", userId: user.id, action: `ACTION_${i}`, resourceType: "X" });
    }
    const page1 = await queryTenantAuditLog(db, { tenantId: tenant.id, page: 1, pageSize: 2 });
    expect(page1.items).toHaveLength(2);
    expect(page1.total).toBe(5);
    expect(page1.items[0].action).toBe("ACTION_4"); // newest first
    const page2 = await queryTenantAuditLog(db, { tenantId: tenant.id, page: 2, pageSize: 2 });
    expect(page2.items[0].action).toBe("ACTION_2");
  });
});

describe("queryPlatformAuditLog (real database)", () => {
  it("returns every tenant's rows plus tenant-NULL rows when tenantId is omitted", async () => {
    const { tenant: a, user: userA } = await seedTenant("school-a");
    const { tenant: b, user: userB } = await seedTenant("school-b");
    const platformUser = await seedPlatformUser();
    await audit.record(db, { tenantId: a.id, actorType: "TENANT_USER", userId: userA.id, action: "X", resourceType: "Y" });
    await audit.record(db, { tenantId: b.id, actorType: "TENANT_USER", userId: userB.id, action: "X", resourceType: "Y" });
    await audit.record(db, { actorType: "PLATFORM_USER", platformUserId: platformUser.id, action: "PLATFORM_ADMIN_CREATED", resourceType: "PLATFORM_USER" });

    const result = await queryPlatformAuditLog(db, {});
    expect(result.total).toBe(3);
  });

  it("scopes to exactly one tenant when tenantId is given", async () => {
    const { tenant: a, user: userA } = await seedTenant("school-a");
    const { tenant: b, user: userB } = await seedTenant("school-b");
    await audit.record(db, { tenantId: a.id, actorType: "TENANT_USER", userId: userA.id, action: "X", resourceType: "Y" });
    await audit.record(db, { tenantId: b.id, actorType: "TENANT_USER", userId: userB.id, action: "X", resourceType: "Y" });

    const result = await queryPlatformAuditLog(db, { tenantId: a.id });
    expect(result.items).toHaveLength(1);
    expect(result.items[0].tenantId).toBe(a.id);
  });
});
