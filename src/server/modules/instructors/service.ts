import { and, asc, eq, ilike, or, sql } from "drizzle-orm";
import { instructors, roles, sessions, users } from "../../core/db/schema";
import { containsPattern } from "../../core/db/search";
import { getInTenant } from "../../core/db/tenant-scope";
import { inTransaction } from "../../core/db/transaction";
import type { DbOrTx, Tx } from "../../core/db/types";
import { NotFoundError, ValidationError, mapDatabaseError } from "../../core/errors";
import { assertFileReference } from "../../core/files/service";
import { normalizeBdMobile } from "@/lib/bd-phone";
import { audit } from "../audit/service";
import { createLogin } from "../auth/credentials";
import { validEmail } from "../auth/platform-admin-input";
import { resetUserPassword } from "../institute/users";
import { assignRoles } from "../rbac/service";

export interface Actor {
  tenantId: string;
  userId: string;
}

export type Gender = "MALE" | "FEMALE" | "OTHER";
export type InstructorStatus = "ACTIVE" | "INACTIVE";

const LOGIN_UNIQUE = {
  users_tenant_email_lower_idx: { code: "CONFLICT_USER_EMAIL", field: "email", message: "Someone in this institute already signs in with this email." },
  users_tenant_phone_idx: { code: "CONFLICT_USER_PHONE", field: "phone", message: "Someone in this institute already signs in with this mobile number." },
};

export interface InstructorInput {
  fullName: string;
  email?: string | null;
  phone?: string | null;
  gender?: Gender | null;
  address?: string | null;
  photoFileId?: string | null;
}

interface CleanIdentity {
  fullName: string;
  email: string | null;
  phone: string | null;
}

/** Name and sign-in identifiers (D17: mobile number or email, at least one). */
function cleanIdentity(input: { fullName: string; email?: string | null; phone?: string | null }): CleanIdentity {
  const fullName = input.fullName.trim();
  const email = input.email?.trim().toLowerCase() || null;
  const rawPhone = input.phone?.trim() || null;
  if (!fullName) throw new ValidationError("VALIDATION_NAME", "The name is required.", { field: "fullName" });
  if (fullName.length > 100) throw new ValidationError("VALIDATION_NAME", "The name can be at most 100 characters.", { field: "fullName" });
  if (email && !validEmail(email)) throw new ValidationError("VALIDATION_EMAIL", "Enter a valid email address.", { field: "email" });
  const phone = rawPhone ? normalizeBdMobile(rawPhone) : null;
  if (rawPhone && !phone) throw new ValidationError("VALIDATION_PHONE", "Enter a valid Bangladeshi mobile number (01XXXXXXXXX).", { field: "phone" });
  if (!email && !phone) throw new ValidationError("VALIDATION_LOGIN_IDENTIFIER", "Give a mobile number or an email to sign in with.", { field: "phone" });
  return { fullName, email, phone };
}

const cleanText = (v: string | null | undefined, max: number, field: string) => {
  const t = v?.trim() || null;
  if (t && t.length > max) throw new ValidationError("VALIDATION_TEXT", `At most ${max} characters.`, { field });
  return t;
};

async function instructorRoleId(tx: Tx, tenantId: string): Promise<string> {
  const [role] = await tx.select({ id: roles.id }).from(roles).where(and(eq(roles.tenantId, tenantId), eq(roles.name, "Instructor"), eq(roles.isSystem, true)));
  if (!role) throw new NotFoundError("ROLE");
  return role.id;
}

/** An instructor with their login (mobile number or email) and the Instructor role. The password is temporary. */
export async function createInstructor(db: DbOrTx, actor: Actor, input: InstructorInput & { temporaryPassword: string }) {
  const identity = cleanIdentity(input);
  const address = cleanText(input.address, 500, "address");
  return inTransaction(db, async (tx) => {
    if (input.photoFileId) await assertFileReference(tx, actor.tenantId, input.photoFileId, "INSTRUCTOR_PHOTO", "photoFileId");
    let user;
    try {
      user = await createLogin(tx, { tenantId: actor.tenantId, name: identity.fullName, email: identity.email, phone: identity.phone, password: input.temporaryPassword });
    } catch (err) {
      throw mapDatabaseError(err, { entity: "INSTRUCTOR", operation: "write", unique: LOGIN_UNIQUE }) ?? err;
    }
    // Through the RBAC service, so nobody can create an instructor login with access they don't hold themselves.
    await assignRoles(tx, { tenantId: actor.tenantId, actorUserId: actor.userId, targetUserId: user.id, roleIds: [await instructorRoleId(tx, actor.tenantId)] });
    const [row] = await tx
      .insert(instructors)
      .values({
        tenantId: actor.tenantId, userId: user.id, fullName: identity.fullName, gender: input.gender ?? null, address,
        photoFileId: input.photoFileId ?? null, createdBy: actor.userId, updatedBy: actor.userId,
      })
      .returning();
    await audit.record(tx, {
      tenantId: actor.tenantId, actorType: "TENANT_USER", userId: actor.userId, action: "INSTRUCTOR_CREATED", resourceType: "INSTRUCTOR", resourceId: row.id,
      newValue: { fullName: identity.fullName, email: identity.email, phone: identity.phone },
    });
    // The only time the temporary password is returned; only its hash is stored.
    return { instructor: await getInstructor(tx, actor.tenantId, row.id), temporaryPassword: input.temporaryPassword };
  });
}

/** Profile changes; name, email and mobile number are kept in step with the login. */
export async function updateInstructor(db: DbOrTx, actor: Actor, id: string, input: Partial<InstructorInput>) {
  return inTransaction(db, async (tx) => {
    const existing = await getInstructor(tx, actor.tenantId, id);
    const identity = cleanIdentity({
      fullName: input.fullName ?? existing.fullName,
      email: input.email === undefined ? existing.email : input.email,
      phone: input.phone === undefined ? existing.phone : input.phone,
    });
    const address = input.address === undefined ? existing.address : cleanText(input.address, 500, "address");
    if (input.photoFileId) await assertFileReference(tx, actor.tenantId, input.photoFileId, "INSTRUCTOR_PHOTO", "photoFileId");
    try {
      await tx.update(users).set({ name: identity.fullName, email: identity.email, phone: identity.phone, updatedAt: new Date() }).where(and(eq(users.tenantId, actor.tenantId), eq(users.id, existing.userId)));
    } catch (err) {
      throw mapDatabaseError(err, { entity: "INSTRUCTOR", operation: "write", unique: LOGIN_UNIQUE }) ?? err;
    }
    await tx
      .update(instructors)
      .set({
        fullName: identity.fullName,
        gender: input.gender === undefined ? existing.gender : input.gender,
        address,
        photoFileId: input.photoFileId === undefined ? existing.photoFileId : input.photoFileId,
        updatedAt: new Date(),
        updatedBy: actor.userId,
      })
      .where(and(eq(instructors.tenantId, actor.tenantId), eq(instructors.id, id)));
    const updated = await getInstructor(tx, actor.tenantId, id);
    await audit.record(tx, {
      tenantId: actor.tenantId, actorType: "TENANT_USER", userId: actor.userId, action: "INSTRUCTOR_UPDATED", resourceType: "INSTRUCTOR", resourceId: id,
      oldValue: { fullName: existing.fullName, email: existing.email, phone: existing.phone, gender: existing.gender, address: existing.address },
      newValue: { fullName: updated.fullName, email: updated.email, phone: updated.phone, gender: updated.gender, address: updated.address },
    });
    return updated;
  });
}

/** INACTIVE bans the login and signs them out everywhere; nothing is deleted. */
export async function setInstructorStatus(db: DbOrTx, actor: Actor, id: string, status: InstructorStatus) {
  return inTransaction(db, async (tx) => {
    const existing = await getInstructor(tx, actor.tenantId, id);
    if (existing.status === status) return existing;
    const inactive = status === "INACTIVE";
    await tx.update(instructors).set({ status, updatedAt: new Date(), updatedBy: actor.userId }).where(and(eq(instructors.tenantId, actor.tenantId), eq(instructors.id, id)));
    await tx.update(users).set({ banned: inactive, bannedAt: inactive ? new Date() : null, updatedAt: new Date() }).where(and(eq(users.tenantId, actor.tenantId), eq(users.id, existing.userId)));
    if (inactive) await tx.delete(sessions).where(eq(sessions.userId, existing.userId));
    await audit.record(tx, {
      tenantId: actor.tenantId, actorType: "TENANT_USER", userId: actor.userId, action: inactive ? "INSTRUCTOR_DEACTIVATED" : "INSTRUCTOR_REACTIVATED",
      resourceType: "INSTRUCTOR", resourceId: id, oldValue: { status: existing.status }, newValue: { status },
    });
    return getInstructor(tx, actor.tenantId, id);
  });
}

export async function resetInstructorPassword(db: DbOrTx, actor: Actor, id: string, temporaryPassword: string) {
  return inTransaction(db, async (tx) => {
    const existing = await getInstructor(tx, actor.tenantId, id);
    return resetUserPassword(tx, actor, existing.userId, temporaryPassword);
  });
}

const instructorColumns = {
  id: instructors.id,
  userId: instructors.userId,
  fullName: instructors.fullName,
  gender: instructors.gender,
  address: instructors.address,
  photoFileId: instructors.photoFileId,
  status: instructors.status,
  createdAt: instructors.createdAt,
  email: users.email,
  phone: users.phone,
  mustChangePassword: users.mustChangePassword,
};

export async function getInstructor(db: DbOrTx, tenantId: string, id: string) {
  await getInTenant(db, instructors, tenantId, id, "INSTRUCTOR");
  const [row] = await db
    .select(instructorColumns)
    .from(instructors)
    .innerJoin(users, and(eq(users.tenantId, instructors.tenantId), eq(users.id, instructors.userId)))
    .where(and(eq(instructors.tenantId, tenantId), eq(instructors.id, id)));
  return row;
}

export interface ListInstructorsParams {
  q?: string;
  status?: InstructorStatus;
  page?: number;
  pageSize?: number;
}

export async function listInstructors(db: DbOrTx, tenantId: string, params: ListInstructorsParams = {}) {
  const page = Math.max(1, Math.trunc(params.page ?? 1));
  const pageSize = Math.min(100, Math.max(1, Math.trunc(params.pageSize ?? 25)));
  const conditions = [
    eq(instructors.tenantId, tenantId),
    params.status ? eq(instructors.status, params.status) : undefined,
    params.q
      ? or(ilike(instructors.fullName, containsPattern(params.q)), ilike(users.email, containsPattern(params.q)), ilike(users.phone, containsPattern(params.q)))
      : undefined,
  ].filter((c): c is NonNullable<typeof c> => !!c);
  const join = and(eq(users.tenantId, instructors.tenantId), eq(users.id, instructors.userId));
  const [items, countRows] = await Promise.all([
    db.select(instructorColumns).from(instructors).innerJoin(users, join).where(and(...conditions)).orderBy(asc(instructors.fullName)).limit(pageSize).offset((page - 1) * pageSize),
    db.select({ count: sql<number>`count(*)::int` }).from(instructors).innerJoin(users, join).where(and(...conditions)),
  ]);
  return { items, total: countRows[0]?.count ?? 0, page, pageSize };
}

/** Active instructors, for pickers such as a batch subject's instructor (M4). */
export async function listAssignableInstructors(db: DbOrTx, tenantId: string) {
  return db
    .select({ id: instructors.id, fullName: instructors.fullName })
    .from(instructors)
    .where(and(eq(instructors.tenantId, tenantId), eq(instructors.status, "ACTIVE")))
    .orderBy(asc(instructors.fullName));
}
