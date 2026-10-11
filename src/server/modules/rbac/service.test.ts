import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { createTestDb } from "../../core/testing/db";
import { permissions, rolePermissions, roles, tenants, userRoles, users } from "../../core/db/schema";
import type { Db } from "../../core/db/types";
import { seedPlatformCatalog } from "../../core/db/seed";
import { INSTITUTE_OWNER_ROLE, type PermissionName } from "../../core/rbac/catalog";
import { assignRoles, findEscalation, getEffectivePermissions, seedBaselineRoles, setRolePermissions, setUserBanned, syncSystemRolePermissions } from "./service";

const { db: testDb, reset, close } = createTestDb();
const db = testDb as unknown as Db;
let seq = 0;
const uniq = () => `user${++seq}`;

beforeEach(async () => {
  await reset();
  await seedPlatformCatalog(testDb);
});

afterAll(async () => {
  await close();
});

async function permissionIdsByName(names: readonly PermissionName[]): Promise<string[]> {
  if (names.length === 0) return [];
  const rows = await testDb.select({ id: permissions.id, name: permissions.name }).from(permissions);
  const byName = new Map(rows.map((r) => [r.name, r.id]));
  return names.map((n) => byName.get(n)!);
}

/**
 * Matches what a real tenant looks like the moment `createTenant` provisions it: every
 * baseline role from `seedBaselineRoles`, plus an Owner user holding the Owner role.
 */
async function seedTenant(name: string, subdomain: string) {
  const [tenant] = await testDb.insert(tenants).values({ name, subdomain, status: "ACTIVE" }).returning();
  const roleIds = await seedBaselineRoles(testDb, tenant.id);

  const [owner] = await testDb.insert(users).values({ tenantId: tenant.id, name: "Owner", username: uniq() }).returning();
  await testDb.update(tenants).set({ ownerUserId: owner.id }).where(eq(tenants.id, tenant.id));
  await testDb.insert(userRoles).values({ tenantId: tenant.id, userId: owner.id, roleId: roleIds[INSTITUTE_OWNER_ROLE] });

  return { tenant: { ...tenant, ownerUserId: owner.id as string | null }, roleIds, owner };
}

async function addUserWithRole(tenantId: string, roleName: string, roleIds: Record<string, string>, name: string) {
  const [user] = await testDb.insert(users).values({ tenantId, name, username: uniq() }).returning();
  await testDb.insert(userRoles).values({ tenantId, userId: user.id, roleId: roleIds[roleName] });
  return user;
}

describe("findEscalation (pure)", () => {
  it("returns the first permission the grantor doesn't already have", () => {
    const grantor = new Set<PermissionName>(["students.view"]);
    expect(findEscalation(["students.view"], grantor)).toBeNull();
    expect(findEscalation(["students.view", "students.create"], grantor)).toBe("students.create");
  });

  it("is satisfied by an empty grant, even against an empty grantor", () => {
    expect(findEscalation([], new Set())).toBeNull();
  });
});

describe("getEffectivePermissions (real database)", () => {
  it("returns the union of permissions across a user's roles", async () => {
    const { tenant, roleIds } = await seedTenant("Institute A", "inst-a");
    const instructor = await addUserWithRole(tenant.id, "Instructor", roleIds, "Instructor A");
    const perms = await getEffectivePermissions(db, tenant.id, instructor.id);
    expect([...perms]).toEqual(["batches.own.view"]);
  });

  it("is empty for a user with no roles", async () => {
    const { tenant } = await seedTenant("Institute A", "inst-a");
    const [nobody] = await testDb.insert(users).values({ tenantId: tenant.id, name: "Nobody", username: uniq() }).returning();
    expect(await getEffectivePermissions(db, tenant.id, nobody.id)).toEqual(new Set());
  });
});

describe("assignRoles (real database)", () => {
  it("lets an actor grant a role that's within their own permissions", async () => {
    const { tenant, roleIds, owner } = await seedTenant("Institute A", "inst-a");
    const [target] = await testDb.insert(users).values({ tenantId: tenant.id, name: "New Accountant", username: uniq() }).returning();
    await assignRoles(db, { tenantId: tenant.id, actorUserId: owner.id, targetUserId: target.id, roleIds: [roleIds["Accountant"]] });
    expect((await getEffectivePermissions(db, tenant.id, target.id)).has("students.contact.view")).toBe(true);
  });

  it("rejects an escalation attempt", async () => {
    const { tenant, roleIds } = await seedTenant("Institute A", "inst-a");
    const instructor = await addUserWithRole(tenant.id, "Instructor", roleIds, "Instructor A");
    const target = await addUserWithRole(tenant.id, "Student", roleIds, "Target");
    await expect(
      assignRoles(db, { tenantId: tenant.id, actorUserId: instructor.id, targetUserId: target.id, roleIds: [roleIds["Accountant"]] }),
    ).rejects.toMatchObject({ code: "PERM_ESCALATION" });
  });

  it("refuses to change the Owner's own roles, even when the Owner is the actor", async () => {
    const { tenant, roleIds, owner } = await seedTenant("Institute A", "inst-a");
    await expect(
      assignRoles(db, { tenantId: tenant.id, actorUserId: owner.id, targetUserId: owner.id, roleIds: [roleIds.Instructor] }),
    ).rejects.toMatchObject({ code: "CONFLICT_OWNER_PROTECTED" });
  });

  it("returns 404 for a role id belonging to another tenant", async () => {
    const { tenant: a, owner } = await seedTenant("Institute A", "inst-a");
    const { roleIds: bRoleIds } = await seedTenant("Institute B", "inst-b");
    const [target] = await testDb.insert(users).values({ tenantId: a.id, name: "Target", username: uniq() }).returning();
    await expect(
      assignRoles(db, { tenantId: a.id, actorUserId: owner.id, targetUserId: target.id, roleIds: [bRoleIds.Teacher] }),
    ).rejects.toMatchObject({ code: "NOT_FOUND_ROLE" });
  });

  it("replaces the target's role set rather than adding to it", async () => {
    const { tenant, roleIds, owner } = await seedTenant("Institute A", "inst-a");
    const target = await addUserWithRole(tenant.id, "Instructor", roleIds, "Target");
    await assignRoles(db, { tenantId: tenant.id, actorUserId: owner.id, targetUserId: target.id, roleIds: [roleIds.Student] });
    const rows = await testDb.select().from(userRoles).where(and(eq(userRoles.tenantId, tenant.id), eq(userRoles.userId, target.id)));
    expect(rows.map((r) => r.roleId)).toEqual([roleIds.Student]);
  });
});

describe("setRolePermissions (real database)", () => {
  it("lets an actor grant permissions to a custom role, within their own permissions", async () => {
    const { tenant, owner } = await seedTenant("Institute A", "inst-a");
    const [customRole] = await testDb.insert(roles).values({ tenantId: tenant.id, name: "Custom", isSystem: false }).returning();
    const permissionIds = await permissionIdsByName(["students.view"]);
    await setRolePermissions(db, { tenantId: tenant.id, actorUserId: owner.id, roleId: customRole.id, permissionIds });
    const rows = await testDb.select().from(rolePermissions).where(eq(rolePermissions.roleId, customRole.id));
    expect(rows).toHaveLength(1);
  });

  it("rejects an escalation attempt", async () => {
    const { tenant, roleIds } = await seedTenant("Institute A", "inst-a");
    const instructor = await addUserWithRole(tenant.id, "Instructor", roleIds, "Instructor A");
    const [customRole] = await testDb.insert(roles).values({ tenantId: tenant.id, name: "Custom", isSystem: false }).returning();
    const permissionIds = await permissionIdsByName(["users.manage"]);
    await expect(
      setRolePermissions(db, { tenantId: tenant.id, actorUserId: instructor.id, roleId: customRole.id, permissionIds }),
    ).rejects.toMatchObject({ code: "PERM_ESCALATION" });
  });

  it("refuses to edit a system role's permissions", async () => {
    const { tenant, roleIds, owner } = await seedTenant("Institute A", "inst-a");
    await expect(
      setRolePermissions(db, { tenantId: tenant.id, actorUserId: owner.id, roleId: roleIds.Instructor, permissionIds: [] }),
    ).rejects.toMatchObject({ code: "CONFLICT_SYSTEM_ROLE" });
  });

  it("returns 404 for a permission id that doesn't exist", async () => {
    const { tenant, owner } = await seedTenant("Institute A", "inst-a");
    const [customRole] = await testDb.insert(roles).values({ tenantId: tenant.id, name: "Custom", isSystem: false }).returning();
    await expect(
      setRolePermissions(db, {
        tenantId: tenant.id,
        actorUserId: owner.id,
        roleId: customRole.id,
        permissionIds: ["00000000-0000-0000-0000-000000000000"],
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND_PERMISSION" });
  });
});

describe("setUserBanned (real database)", () => {
  it("disables a non-owner user", async () => {
    const { tenant, roleIds } = await seedTenant("Institute A", "inst-a");
    const instructor = await addUserWithRole(tenant.id, "Instructor", roleIds, "Instructor A");
    const updated = await setUserBanned(db, { tenantId: tenant.id, targetUserId: instructor.id, banned: true });
    expect(updated.banned).toBe(true);
    expect(updated.bannedAt).not.toBeNull();
  });

  it("re-enables a disabled user", async () => {
    const { tenant, roleIds } = await seedTenant("Institute A", "inst-a");
    const instructor = await addUserWithRole(tenant.id, "Instructor", roleIds, "Instructor A");
    await setUserBanned(db, { tenantId: tenant.id, targetUserId: instructor.id, banned: true });
    const updated = await setUserBanned(db, { tenantId: tenant.id, targetUserId: instructor.id, banned: false });
    expect(updated.banned).toBe(false);
    expect(updated.bannedAt).toBeNull();
  });

  it("refuses to disable the Owner", async () => {
    const { tenant, owner } = await seedTenant("Institute A", "inst-a");
    await expect(setUserBanned(db, { tenantId: tenant.id, targetUserId: owner.id, banned: true })).rejects.toMatchObject({
      code: "CONFLICT_OWNER_PROTECTED",
    });
  });

  it("returns 404 for a user id from another tenant", async () => {
    const { tenant: a } = await seedTenant("Institute A", "inst-a");
    const { owner: ownerB } = await seedTenant("Institute B", "inst-b");
    await expect(setUserBanned(db, { tenantId: a.id, targetUserId: ownerB.id, banned: true })).rejects.toMatchObject({
      code: "NOT_FOUND_USER",
    });
  });
});

describe("syncSystemRolePermissions (real database)", () => {
  it("gives existing institutes' system roles the permissions a release added, once, without touching custom roles", async () => {
    const { tenant, owner } = await seedTenant("Sync Institute", "sync-inst");
    // Simulate an institute created before the fee permissions existed.
    const [missing] = await permissionIdsByName(["fees.view"]);
    await testDb.delete(rolePermissions).where(eq(rolePermissions.permissionId, missing));
    expect((await getEffectivePermissions(testDb, tenant.id, owner.id)).has("fees.view")).toBe(false);
    const [custom] = await testDb.insert(roles).values({ tenantId: tenant.id, name: "Custom", isSystem: false }).returning();

    const first = await syncSystemRolePermissions(testDb);
    expect(first.granted).toBe(2); // Owner and Admin (all permissions)
    expect((await getEffectivePermissions(testDb, tenant.id, owner.id)).has("fees.view")).toBe(true);
    expect(await testDb.select().from(rolePermissions).where(eq(rolePermissions.roleId, custom.id))).toHaveLength(0);
    expect((await syncSystemRolePermissions(testDb)).granted).toBe(0);
  });

  it("creates a role template an institute predates (Accountant), with its permissions, and leaves a custom role of that name alone", async () => {
    const { tenant: older } = await seedTenant("Older Institute", "older-inst");
    await testDb.delete(roles).where(and(eq(roles.tenantId, older.id), eq(roles.name, "Accountant")));
    const { tenant: own } = await seedTenant("Own Accountant Institute", "own-inst");
    await testDb.delete(roles).where(and(eq(roles.tenantId, own.id), eq(roles.name, "Accountant")));
    const [custom] = await testDb.insert(roles).values({ tenantId: own.id, name: "Accountant", isSystem: false }).returning();

    const result = await syncSystemRolePermissions(testDb);
    expect(result.rolesCreated).toBe(1);
    const [created] = await testDb.select().from(roles).where(and(eq(roles.tenantId, older.id), eq(roles.name, "Accountant")));
    expect(created.isSystem).toBe(true);
    const granted = await testDb.select().from(rolePermissions).where(eq(rolePermissions.roleId, created.id));
    expect(granted.length).toBeGreaterThan(0);
    expect(await testDb.select().from(rolePermissions).where(eq(rolePermissions.roleId, custom.id))).toHaveLength(0);
    expect((await syncSystemRolePermissions(testDb)).rolesCreated).toBe(0);
  });
});
