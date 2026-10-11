import { and, asc, eq, inArray } from "drizzle-orm";
import { accounts, permissions, rolePermissions, roles, sessions, tenants, userRoles, users } from "../../core/db/schema";
import { getInTenant } from "../../core/db/tenant-scope";
import { inTransaction } from "../../core/db/transaction";
import type { DbOrTx } from "../../core/db/types";
import { ConflictError, ValidationError, mapDatabaseError } from "../../core/errors";
import { audit } from "../audit/service";
import { createLogin } from "../auth/credentials";
import { hashPassword, passwordProblem } from "../auth/password";
import { validEmail } from "../auth/platform-admin-input";
import { assignRoles, setUserBanned } from "../rbac/service";

export interface Actor {
  tenantId: string;
  userId: string;
}

const LOGIN_UNIQUE = {
  users_tenant_email_lower_idx: { code: "CONFLICT_USER_EMAIL", field: "email", message: "Someone in this institute already signs in with this email." },
  users_tenant_phone_idx: { code: "CONFLICT_USER_PHONE", field: "phone", message: "Someone in this institute already signs in with this mobile number." },
};

export async function listRoles(db: DbOrTx, tenantId: string) {
  const rows = await db
    .select({ id: roles.id, name: roles.name, isSystem: roles.isSystem, permission: permissions.name })
    .from(roles)
    .leftJoin(rolePermissions, and(eq(rolePermissions.tenantId, roles.tenantId), eq(rolePermissions.roleId, roles.id)))
    .leftJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
    .where(eq(roles.tenantId, tenantId))
    .orderBy(asc(roles.name));
  const byId = new Map<string, { id: string; name: string; isSystem: boolean; permissions: string[] }>();
  for (const r of rows) {
    const role = byId.get(r.id) ?? { id: r.id, name: r.name, isSystem: r.isSystem, permissions: [] };
    if (r.permission) role.permissions.push(r.permission);
    byId.set(r.id, role);
  }
  return [...byId.values()].map((r) => ({ ...r, permissions: r.permissions.sort() }));
}

/** Everyone who can sign in to the institute, with their roles. Credentials are never returned. */
export async function listUsers(db: DbOrTx, tenantId: string) {
  const [tenant] = await db.select({ ownerUserId: tenants.ownerUserId }).from(tenants).where(eq(tenants.id, tenantId));
  const rows = await db
    .select({ id: users.id, name: users.name, email: users.email, phone: users.phone, username: users.username, banned: users.banned, mustChangePassword: users.mustChangePassword, createdAt: users.createdAt })
    .from(users)
    .where(eq(users.tenantId, tenantId))
    .orderBy(asc(users.name));
  const roleRows = rows.length
    ? await db
        .select({ userId: userRoles.userId, roleId: roles.id, roleName: roles.name })
        .from(userRoles)
        .innerJoin(roles, and(eq(roles.tenantId, userRoles.tenantId), eq(roles.id, userRoles.roleId)))
        .where(and(eq(userRoles.tenantId, tenantId), inArray(userRoles.userId, rows.map((r) => r.id))))
    : [];
  return rows.map((u) => ({
    ...u,
    isOwner: u.id === tenant?.ownerUserId,
    roles: roleRows.filter((r) => r.userId === u.id).map((r) => ({ id: r.roleId, name: r.roleName })),
  }));
}

export interface NewStaffUser {
  name: string;
  email?: string | null;
  phone?: string | null;
  roleIds: string[];
  temporaryPassword: string;
}

/**
 * A staff login (e.g. an Admin or Accountant) with a temporary password, changed at first sign-in. The roles are
 * granted through the RBAC service, so nobody can create a user with more access than they have themselves.
 */
export async function createStaffUser(db: DbOrTx, actor: Actor, input: NewStaffUser) {
  const name = input.name.trim();
  const email = input.email?.trim().toLowerCase() || null;
  const phone = input.phone?.trim() || null;
  if (!name) throw new ValidationError("VALIDATION_NAME", "The name is required.", { field: "name" });
  if (!email && !phone) throw new ValidationError("VALIDATION_LOGIN_IDENTIFIER", "Give an email or a mobile number to sign in with.", { field: "email" });
  if (email && !validEmail(email)) throw new ValidationError("VALIDATION_EMAIL", "Enter a valid email address.", { field: "email" });
  if (input.roleIds.length === 0) throw new ValidationError("VALIDATION_ROLES", "Choose at least one role.", { field: "roleIds" });

  return inTransaction(db, async (tx) => {
    let user;
    try {
      user = await createLogin(tx, { tenantId: actor.tenantId, name, email, phone, password: input.temporaryPassword });
    } catch (err) {
      throw mapDatabaseError(err, { entity: "USER", operation: "write", unique: LOGIN_UNIQUE }) ?? err;
    }
    await assignRoles(tx, { tenantId: actor.tenantId, actorUserId: actor.userId, targetUserId: user.id, roleIds: input.roleIds });
    await audit.record(tx, {
      tenantId: actor.tenantId, actorType: "TENANT_USER", userId: actor.userId, action: "USER_CREATED", resourceType: "USER", resourceId: user.id,
      newValue: { name, email, phone: user.phone, roleIds: input.roleIds },
    });
    // The only time the temporary password is returned; only its hash is stored.
    return { user: { id: user.id, name: user.name, email: user.email, phone: user.phone }, temporaryPassword: input.temporaryPassword };
  });
}

export async function setUserRoles(db: DbOrTx, actor: Actor, targetUserId: string, roleIds: string[]) {
  return inTransaction(db, async (tx) => {
    const before = (await listUsers(tx, actor.tenantId)).find((u) => u.id === targetUserId);
    await assignRoles(tx, { tenantId: actor.tenantId, actorUserId: actor.userId, targetUserId, roleIds });
    await audit.record(tx, {
      tenantId: actor.tenantId, actorType: "TENANT_USER", userId: actor.userId, action: "USER_ROLES_CHANGED", resourceType: "USER", resourceId: targetUserId,
      oldValue: { roles: before?.roles.map((r) => r.name) ?? [] },
      newValue: { roleIds: [...new Set(roleIds)] },
    });
  });
}

/** Disabling signs the user out everywhere; the Owner can't be disabled (only a Platform Admin can transfer ownership). */
export async function setUserDisabled(db: DbOrTx, actor: Actor, targetUserId: string, disabled: boolean) {
  if (disabled && targetUserId === actor.userId) throw new ConflictError("CONFLICT_SELF_DISABLE", "You can't disable your own account.");
  return inTransaction(db, async (tx) => {
    const updated = await setUserBanned(tx, { tenantId: actor.tenantId, targetUserId, banned: disabled });
    await audit.record(tx, {
      tenantId: actor.tenantId, actorType: "TENANT_USER", userId: actor.userId, action: disabled ? "USER_DISABLED" : "USER_ENABLED",
      resourceType: "USER", resourceId: targetUserId,
    });
    return { id: updated.id, banned: updated.banned };
  });
}

/** A new temporary password, changed at next sign-in; signs the user out everywhere. The Owner resets their own. */
export async function resetUserPassword(db: DbOrTx, actor: Actor, targetUserId: string, temporaryPassword: string) {
  const problem = passwordProblem(temporaryPassword);
  if (problem) throw new ValidationError("VALIDATION_TEMP_PASSWORD", problem, { field: "temporaryPassword" });
  return inTransaction(db, async (tx) => {
    const [tenant] = await tx.select({ ownerUserId: tenants.ownerUserId }).from(tenants).where(eq(tenants.id, actor.tenantId));
    const target = await getInTenant(tx, users, actor.tenantId, targetUserId, "USER");
    if (target.id === tenant?.ownerUserId && actor.userId !== target.id) {
      throw new ConflictError("CONFLICT_OWNER_PROTECTED", "Only the Owner can change the Owner's password.");
    }
    await tx.update(accounts).set({ password: await hashPassword(temporaryPassword), updatedAt: new Date() }).where(and(eq(accounts.userId, target.id), eq(accounts.providerId, "credential")));
    await tx.update(users).set({ mustChangePassword: true, updatedAt: new Date() }).where(eq(users.id, target.id));
    await tx.delete(sessions).where(eq(sessions.userId, target.id));
    await audit.record(tx, {
      tenantId: actor.tenantId, actorType: "TENANT_USER", userId: actor.userId, action: "USER_PASSWORD_RESET", resourceType: "USER", resourceId: target.id,
    });
    return { temporaryPassword };
  });
}
