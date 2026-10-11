import { and, eq, inArray } from "drizzle-orm";
import { ConflictError, ForbiddenError, NotFoundError } from "../../core/errors";
import { permissions, rolePermissions, roles, sessions, tenants, userRoles, users } from "../../core/db/schema";
import { getInTenant } from "../../core/db/tenant-scope";
import { inTransaction } from "../../core/db/transaction";
import type { DbOrTx, Tx } from "../../core/db/types";
import { ROLE_TEMPLATES, resolveTemplatePermissions, type PermissionName } from "../../core/rbac/catalog";

// Two invariants for every tenant-side grant: no privilege escalation, and the Owner
// (changeable only by a Platform Admin transfer) can't be demoted or disabled here.

async function loadTenant(tx: Tx, tenantId: string) {
  const [tenant] = await tx.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  if (!tenant) throw new NotFoundError("TENANT");
  return tenant;
}

function assertNotOwner(tenant: { ownerUserId: string | null }, targetUserId: string, message: string) {
  if (tenant.ownerUserId === targetUserId) {
    throw new ConflictError("CONFLICT_OWNER_PROTECTED", message);
  }
}

export async function getEffectivePermissions(db: DbOrTx, tenantId: string, userId: string): Promise<Set<PermissionName>> {
  const rows = await db
    .select({ name: permissions.name })
    .from(userRoles)
    .innerJoin(
      rolePermissions,
      and(eq(rolePermissions.tenantId, userRoles.tenantId), eq(rolePermissions.roleId, userRoles.roleId)),
    )
    .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
    .where(and(eq(userRoles.tenantId, tenantId), eq(userRoles.userId, userId)));
  return new Set(rows.map((r) => r.name as PermissionName));
}

async function permissionsForRoles(tx: Tx, tenantId: string, roleIds: string[]): Promise<Set<PermissionName>> {
  if (roleIds.length === 0) return new Set();
  const rows = await tx
    .select({ name: permissions.name })
    .from(rolePermissions)
    .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
    .where(and(eq(rolePermissions.tenantId, tenantId), inArray(rolePermissions.roleId, roleIds)));
  return new Set(rows.map((r) => r.name as PermissionName));
}

/** The first granted permission the grantor doesn't hold, or null. */
export function findEscalation(granted: Iterable<PermissionName>, grantorPermissions: Set<PermissionName>): PermissionName | null {
  for (const permission of granted) {
    if (!grantorPermissions.has(permission)) return permission;
  }
  return null;
}

function assertSubsetOfGrantor(granted: Set<PermissionName>, grantorPermissions: Set<PermissionName>) {
  const escalated = findEscalation(granted, grantorPermissions);
  if (escalated) {
    throw new ForbiddenError("PERM_ESCALATION", "You can't grant a permission you don't have yourself.", { permission: escalated });
  }
}

export interface AssignRolesInput {
  tenantId: string;
  actorUserId: string;
  targetUserId: string;
  roleIds: string[];
}

/** Replaces the user's roles with exactly `roleIds`. */
export async function assignRoles(db: DbOrTx, input: AssignRolesInput): Promise<void> {
  await inTransaction(db, async (tx) => {
    const tenant = await loadTenant(tx, input.tenantId);
    assertNotOwner(
      tenant,
      input.targetUserId,
      "The Owner's roles can only be changed by transferring ownership, which only a Platform Admin can do.",
    );
    await getInTenant(tx, users, input.tenantId, input.targetUserId, "USER");

    const roleIds = [...new Set(input.roleIds)];
    for (const roleId of roleIds) {
      await getInTenant(tx, roles, input.tenantId, roleId, "ROLE");
    }

    const granted = await permissionsForRoles(tx, input.tenantId, roleIds);
    const actorPermissions = await getEffectivePermissions(tx, input.tenantId, input.actorUserId);
    assertSubsetOfGrantor(granted, actorPermissions);

    await tx.delete(userRoles).where(and(eq(userRoles.tenantId, input.tenantId), eq(userRoles.userId, input.targetUserId)));
    if (roleIds.length > 0) {
      await tx.insert(userRoles).values(roleIds.map((roleId) => ({ tenantId: input.tenantId, userId: input.targetUserId, roleId })));
    }
  });
}

export interface SetRolePermissionsInput {
  tenantId: string;
  actorUserId: string;
  roleId: string;
  permissionIds: string[];
}

/**
 * Replaces the role's permissions with exactly `permissionIds`. System roles are immutable,
 * otherwise weakening "Owner" would demote the Owner indirectly.
 */
export async function setRolePermissions(db: DbOrTx, input: SetRolePermissionsInput): Promise<void> {
  await inTransaction(db, async (tx) => {
    const role = await getInTenant(tx, roles, input.tenantId, input.roleId, "ROLE");
    if (role.isSystem) {
      throw new ConflictError("CONFLICT_SYSTEM_ROLE", "This is a system role and its permissions can't be changed.");
    }

    const permissionIds = [...new Set(input.permissionIds)];
    const grantedRows =
      permissionIds.length > 0 ? await tx.select().from(permissions).where(inArray(permissions.id, permissionIds)) : [];
    if (grantedRows.length !== permissionIds.length) throw new NotFoundError("PERMISSION");

    const granted = new Set(grantedRows.map((p) => p.name as PermissionName));
    const actorPermissions = await getEffectivePermissions(tx, input.tenantId, input.actorUserId);
    assertSubsetOfGrantor(granted, actorPermissions);

    await tx.delete(rolePermissions).where(and(eq(rolePermissions.tenantId, input.tenantId), eq(rolePermissions.roleId, input.roleId)));
    if (permissionIds.length > 0) {
      await tx
        .insert(rolePermissions)
        .values(permissionIds.map((permissionId) => ({ tenantId: input.tenantId, roleId: input.roleId, permissionId })));
    }
  });
}

/** Disabling revokes every session immediately rather than waiting for them to expire. */
export async function setUserBanned(db: DbOrTx, params: { tenantId: string; targetUserId: string; banned: boolean }) {
  return inTransaction(db, async (tx) => {
    const tenant = await loadTenant(tx, params.tenantId);
    if (params.banned) {
      assertNotOwner(
        tenant,
        params.targetUserId,
        "The Owner can't be disabled. Ownership must be transferred by a Platform Admin first.",
      );
    }
    const target = await getInTenant(tx, users, params.tenantId, params.targetUserId, "USER");

    const [updated] = await tx
      .update(users)
      .set({ banned: params.banned, bannedAt: params.banned ? new Date() : null, updatedAt: new Date() })
      .where(eq(users.id, target.id))
      .returning();

    if (params.banned) {
      await tx.delete(sessions).where(eq(sessions.userId, target.id));
    }
    return updated;
  });
}

/** Creates the baseline system roles for a new tenant. Returns role ids keyed by role name. */
export async function seedBaselineRoles(db: DbOrTx, tenantId: string): Promise<Record<string, string>> {
  const permissionRows = await db.select({ id: permissions.id, name: permissions.name }).from(permissions);
  const permissionIdByName = new Map(permissionRows.map((p) => [p.name as PermissionName, p.id]));

  const roleIds: Record<string, string> = {};
  for (const template of ROLE_TEMPLATES) {
    const [role] = await db.insert(roles).values({ tenantId, name: template.name, isSystem: true }).returning();
    roleIds[template.name] = role.id;

    const permissionIds = resolveTemplatePermissions(template)
      .map((name) => permissionIdByName.get(name))
      .filter((id): id is string => !!id);
    if (permissionIds.length > 0) {
      await db.insert(rolePermissions).values(permissionIds.map((permissionId) => ({ tenantId, roleId: role.id, permissionId })));
    }
  }
  return roleIds;
}

/**
 * Brings every institute's system roles up to their templates after a release (run by `db:seed` on each deploy): a
 * role template added later (e.g. Accountant) is created for institutes that predate it, and new permissions are
 * granted. Additive only: system roles can't be edited, so nothing an institute chose is overridden. An institute's own
 * custom role with a template's name is left alone (the unique name index skips it). Idempotent.
 */
export async function syncSystemRolePermissions(db: DbOrTx): Promise<{ granted: number; rolesCreated: number }> {
  const permissionRows = await db.select({ id: permissions.id, name: permissions.name }).from(permissions);
  const permissionIdByName = new Map(permissionRows.map((p) => [p.name as PermissionName, p.id]));
  const tenantIds = (await db.select({ id: tenants.id }).from(tenants)).map((t) => t.id);
  let granted = 0;
  let rolesCreated = 0;
  for (const template of ROLE_TEMPLATES) {
    if (tenantIds.length > 0) {
      const created = await db
        .insert(roles)
        .values(tenantIds.map((tenantId) => ({ tenantId, name: template.name, isSystem: true })))
        .onConflictDoNothing()
        .returning({ id: roles.id });
      rolesCreated += created.length;
    }
    const permissionIds = resolveTemplatePermissions(template)
      .map((name) => permissionIdByName.get(name))
      .filter((id): id is string => !!id);
    if (permissionIds.length === 0) continue;
    const systemRoles = await db.select({ id: roles.id, tenantId: roles.tenantId }).from(roles).where(and(eq(roles.isSystem, true), eq(roles.name, template.name)));
    for (const role of systemRoles) {
      const inserted = await db
        .insert(rolePermissions)
        .values(permissionIds.map((permissionId) => ({ tenantId: role.tenantId, roleId: role.id, permissionId })))
        .onConflictDoNothing()
        .returning({ permissionId: rolePermissions.permissionId });
      granted += inserted.length;
    }
  }
  return { granted, rolesCreated };
}
