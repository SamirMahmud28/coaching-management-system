import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "../testing/db";
import { permissions, rolePermissions, roles, tenants, userRoles, users } from "./schema";

// Database-level tenant isolation: the composite (tenant_id, x_id) foreign keys must reject
// a row that links records from two different tenants, even if a service-layer check is missed.
const { db, reset, close } = createTestDb();

async function seedTwoTenants() {
  const [tenantA, tenantB] = await db
    .insert(tenants)
    .values([
      { name: "School A", subdomain: "school-a", status: "ACTIVE" },
      { name: "School B", subdomain: "school-b", status: "ACTIVE" },
    ])
    .returning();
  const [userA] = await db.insert(users).values({ tenantId: tenantA.id, name: "User A", email: "a@example.com" }).returning();
  const [roleA] = await db.insert(roles).values({ tenantId: tenantA.id, name: "School Admin" }).returning();
  const [roleB] = await db.insert(roles).values({ tenantId: tenantB.id, name: "School Admin" }).returning();
  const [perm] = await db.insert(permissions).values({ name: "students.view" }).returning();
  return { tenantA, tenantB, userA, roleA, roleB, perm };
}

describe("tenant isolation — composite foreign keys", () => {
  beforeEach(async () => {
    await reset();
  });

  afterAll(async () => {
    await close();
  });

  it("allows a same-tenant user_roles row", async () => {
    const { tenantA, userA, roleA } = await seedTwoTenants();
    await expect(
      db.insert(userRoles).values({ tenantId: tenantA.id, userId: userA.id, roleId: roleA.id }),
    ).resolves.toBeDefined();
  });

  it("rejects assigning tenant B's role to tenant A's user", async () => {
    const { tenantA, userA, roleB } = await seedTwoTenants();
    await expect(
      db.insert(userRoles).values({ tenantId: tenantA.id, userId: userA.id, roleId: roleB.id }),
    ).rejects.toThrow();
  });

  it("rejects relabelling the row as tenant B to smuggle in tenant A's user", async () => {
    const { tenantB, userA, roleB } = await seedTwoTenants();
    await expect(
      db.insert(userRoles).values({ tenantId: tenantB.id, userId: userA.id, roleId: roleB.id }),
    ).rejects.toThrow();
  });

  it("rejects granting a permission to another tenant's role", async () => {
    const { tenantA, roleB, perm } = await seedTwoTenants();
    await expect(
      db.insert(rolePermissions).values({ tenantId: tenantA.id, roleId: roleB.id, permissionId: perm.id }),
    ).rejects.toThrow();
  });

  it("allows the same email in two tenants but not twice in one tenant", async () => {
    const { tenantA, tenantB } = await seedTwoTenants();
    await expect(
      db.insert(users).values({ tenantId: tenantB.id, name: "Same person, other school", email: "A@Example.com" }),
    ).resolves.toBeDefined();
    await expect(
      db.insert(users).values({ tenantId: tenantA.id, name: "Duplicate", email: "A@EXAMPLE.COM" }),
    ).rejects.toThrow();
  });

  it("rejects a duplicate subdomain regardless of case", async () => {
    await seedTwoTenants();
    await expect(
      db.insert(tenants).values({ name: "Copycat", subdomain: "SCHOOL-A" }),
    ).rejects.toThrow();
  });
});
