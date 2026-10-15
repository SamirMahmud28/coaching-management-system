import { and, asc, eq } from "drizzle-orm";
import { institutionProfiles, signatures, studentIdSettings, tenants } from "../../core/db/schema";
import { getInTenant } from "../../core/db/tenant-scope";
import { inTransaction } from "../../core/db/transaction";
import type { DbOrTx } from "../../core/db/types";
import { NotFoundError, ValidationError, mapDatabaseError } from "../../core/errors";
import { assertFileReference } from "../../core/files/service";
import { validEmail } from "../auth/platform-admin-input";
import { audit } from "../audit/service";
import { DEFAULT_APP_THEME, isAppTheme, type AppTheme } from "@/lib/app-themes";
import { DEFAULT_STUDENT_ID_PATTERN, formatStudentId, studentIdPatternProblem, type StudentIdPattern } from "@/lib/student-id";

export interface Actor {
  tenantId: string;
  userId: string;
}

// ---------------------------------------------------------------------------
// Institution profile & branding
// ---------------------------------------------------------------------------

export interface InstitutionProfile {
  displayName: string;
  shortName: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  institutionCode: string | null;
  logoFileId: string | null;
  primaryColor: string | null;
  secondaryColor: string | null;
  /** True until the institute saves its profile; the name then comes from the tenant. */
  isDefault: boolean;
}

export async function getInstitutionProfile(db: DbOrTx, tenantId: string): Promise<InstitutionProfile> {
  const [row] = await db
    .select({
      displayName: institutionProfiles.displayName,
      shortName: institutionProfiles.shortName,
      address: institutionProfiles.address,
      phone: institutionProfiles.phone,
      email: institutionProfiles.email,
      website: institutionProfiles.website,
      institutionCode: institutionProfiles.institutionCode,
      logoFileId: institutionProfiles.logoFileId,
      primaryColor: institutionProfiles.primaryColor,
      secondaryColor: institutionProfiles.secondaryColor,
    })
    .from(institutionProfiles)
    .where(eq(institutionProfiles.tenantId, tenantId));
  if (row) return { ...row, isDefault: false };
  const [tenant] = await db.select({ name: tenants.name }).from(tenants).where(eq(tenants.id, tenantId));
  return {
    displayName: tenant?.name ?? "", shortName: null, address: null, phone: null, email: null, website: null,
    institutionCode: null, logoFileId: null, primaryColor: null, secondaryColor: null, isDefault: true,
  };
}

export type InstitutionProfileInput = Omit<InstitutionProfile, "isDefault">;

const HEX = /^#[0-9a-f]{6}$/;
const clean = (v: string | null | undefined) => {
  const t = v?.trim();
  return t ? t : null;
};

function validateProfile(input: InstitutionProfileInput): InstitutionProfileInput {
  const out = {
    displayName: input.displayName.trim(),
    shortName: clean(input.shortName),
    address: clean(input.address),
    phone: clean(input.phone),
    email: clean(input.email),
    website: clean(input.website),
    institutionCode: clean(input.institutionCode),
    logoFileId: input.logoFileId ?? null,
    primaryColor: clean(input.primaryColor)?.toLowerCase() ?? null,
    secondaryColor: clean(input.secondaryColor)?.toLowerCase() ?? null,
  };
  const fail = (code: string, message: string, field: string): never => {
    throw new ValidationError(code, message, { field });
  };
  if (!out.displayName) fail("VALIDATION_NAME", "The institute's name is required.", "displayName");
  if (out.displayName.length > 150) fail("VALIDATION_NAME", "The name can be at most 150 characters.", "displayName");
  if (out.shortName && out.shortName.length > 50) fail("VALIDATION_SHORT_NAME", "The short name can be at most 50 characters.", "shortName");
  if (out.address && out.address.length > 500) fail("VALIDATION_ADDRESS", "The address can be at most 500 characters.", "address");
  if (out.phone && !/^[+0-9][0-9 ()-]{5,29}$/.test(out.phone)) fail("VALIDATION_PHONE", "Enter a valid phone number.", "phone");
  if (out.email && !validEmail(out.email)) fail("VALIDATION_EMAIL", "Enter a valid email address.", "email");
  if (out.website) {
    let ok = false;
    try {
      const url = new URL(out.website);
      ok = (url.protocol === "https:" || url.protocol === "http:") && out.website.length <= 200;
    } catch {
      ok = false;
    }
    if (!ok) fail("VALIDATION_WEBSITE", "Enter a full web address, e.g. https://example.com.bd.", "website");
  }
  if (out.institutionCode && out.institutionCode.length > 30) fail("VALIDATION_INSTITUTION_CODE", "The code can be at most 30 characters.", "institutionCode");
  if (out.primaryColor && !HEX.test(out.primaryColor)) fail("VALIDATION_COLOR", "Use a colour like #1f6feb.", "primaryColor");
  if (out.secondaryColor && !HEX.test(out.secondaryColor)) fail("VALIDATION_COLOR", "Use a colour like #1f6feb.", "secondaryColor");
  return out;
}

export async function saveInstitutionProfile(db: DbOrTx, actor: Actor, input: InstitutionProfileInput): Promise<InstitutionProfile> {
  const values = validateProfile(input);
  return inTransaction(db, async (tx) => {
    if (values.logoFileId) await assertFileReference(tx, actor.tenantId, values.logoFileId, "LOGO", "logoFileId");
    const before = await getInstitutionProfile(tx, actor.tenantId);
    await tx
      .insert(institutionProfiles)
      .values({ tenantId: actor.tenantId, ...values, createdBy: actor.userId, updatedBy: actor.userId })
      .onConflictDoUpdate({ target: institutionProfiles.tenantId, set: { ...values, updatedAt: new Date(), updatedBy: actor.userId } });
    await audit.record(tx, {
      tenantId: actor.tenantId,
      actorType: "TENANT_USER",
      userId: actor.userId,
      action: "INSTITUTION_PROFILE_UPDATED",
      resourceType: "INSTITUTION_PROFILE",
      resourceId: actor.tenantId,
      oldValue: before.isDefault ? null : { ...before, isDefault: undefined },
      newValue: values,
    });
    return { ...values, isDefault: false };
  });
}

// ---------------------------------------------------------------------------
// App theme (D156, D157): one colour theme for the institute's office and portals
// ---------------------------------------------------------------------------

export interface Appearance {
  appTheme: AppTheme;
  /** The paper texture (D158): null = automatic (on with Classic Amber, see resolvePaper), else the admin's choice. */
  paperBackground: boolean | null;
}

export async function getAppearance(db: DbOrTx, tenantId: string): Promise<Appearance> {
  const [row] = await db
    .select({ appTheme: institutionProfiles.appTheme, paperBackground: institutionProfiles.paperBackground })
    .from(institutionProfiles)
    .where(eq(institutionProfiles.tenantId, tenantId));
  return { appTheme: row?.appTheme ?? DEFAULT_APP_THEME, paperBackground: row?.paperBackground ?? null };
}

export async function getAppTheme(db: DbOrTx, tenantId: string): Promise<AppTheme> {
  return (await getAppearance(db, tenantId)).appTheme;
}

/** Who changes the theme: the institute's own admin, or the Super Admin from the institute's page (D157). */
export type ThemeActor = { type: "TENANT_USER"; userId: string } | { type: "PLATFORM_USER"; platformUserId: string };

/**
 * Sets the institute's app theme and, when given, the paper background (`undefined` keeps it), audited in the same
 * transaction. Before the profile is first saved there is no row, so one is created with the institute's name (what the
 * profile shows until then anyway).
 */
export async function setAppTheme(
  db: DbOrTx,
  params: { tenantId: string; theme: AppTheme; paper?: boolean | null; actor: ThemeActor },
): Promise<Appearance> {
  if (!isAppTheme(params.theme)) throw new ValidationError("VALIDATION_FAILED", "Choose one of the listed themes.", { field: "appTheme" });
  return inTransaction(db, async (tx) => {
    const [tenant] = await tx.select({ name: tenants.name }).from(tenants).where(eq(tenants.id, params.tenantId));
    if (!tenant) throw new NotFoundError("TENANT");
    const before = await getAppearance(tx, params.tenantId);
    const after: Appearance = { appTheme: params.theme, paperBackground: params.paper === undefined ? before.paperBackground : params.paper };
    const userId = params.actor.type === "TENANT_USER" ? params.actor.userId : null;
    await tx
      .insert(institutionProfiles)
      .values({ tenantId: params.tenantId, displayName: tenant.name, ...after, createdBy: userId, updatedBy: userId })
      .onConflictDoUpdate({ target: institutionProfiles.tenantId, set: { ...after, updatedAt: new Date(), updatedBy: userId } });
    await audit.record(tx, {
      tenantId: params.tenantId,
      actorType: params.actor.type,
      ...(params.actor.type === "TENANT_USER" ? { userId: params.actor.userId } : { platformUserId: params.actor.platformUserId }),
      action: "APP_THEME_CHANGED",
      resourceType: "INSTITUTION_PROFILE",
      resourceId: params.tenantId,
      oldValue: { ...before },
      newValue: { ...after },
    });
    return after;
  });
}

// ---------------------------------------------------------------------------
// Signatures (signatories printed on documents)
// ---------------------------------------------------------------------------

const SIGNATURE_UNIQUE = {
  signatures_tenant_title_lower_idx: { code: "CONFLICT_SIGNATURE_TITLE", field: "title", message: "A signatory with this title already exists." },
};

export interface SignatureInput {
  title: string;
  personName: string;
  signatureFileId?: string | null;
  sortOrder?: number;
}

function validateSignature(input: Partial<SignatureInput>, partial: boolean) {
  const title = input.title?.trim();
  const personName = input.personName?.trim();
  if (!partial || input.title !== undefined) {
    if (!title) throw new ValidationError("VALIDATION_TITLE", "The title is required, e.g. Principal.", { field: "title" });
    if (title.length > 50) throw new ValidationError("VALIDATION_TITLE", "The title can be at most 50 characters.", { field: "title" });
  }
  if (!partial || input.personName !== undefined) {
    if (!personName) throw new ValidationError("VALIDATION_PERSON_NAME", "The person's name is required.", { field: "personName" });
    if (personName.length > 100) throw new ValidationError("VALIDATION_PERSON_NAME", "The name can be at most 100 characters.", { field: "personName" });
  }
  return { title, personName };
}

export async function listSignatures(db: DbOrTx, tenantId: string) {
  return db.select().from(signatures).where(eq(signatures.tenantId, tenantId)).orderBy(asc(signatures.sortOrder), asc(signatures.title));
}

export async function createSignature(db: DbOrTx, actor: Actor, input: SignatureInput) {
  const { title, personName } = validateSignature(input, false);
  return inTransaction(db, async (tx) => {
    if (input.signatureFileId) await assertFileReference(tx, actor.tenantId, input.signatureFileId, "SIGNATURE", "signatureFileId");
    let row;
    try {
      [row] = await tx
        .insert(signatures)
        .values({
          tenantId: actor.tenantId, title: title!, personName: personName!, signatureFileId: input.signatureFileId ?? null,
          sortOrder: input.sortOrder ?? 100, createdBy: actor.userId, updatedBy: actor.userId,
        })
        .returning();
    } catch (err) {
      throw mapDatabaseError(err, { entity: "SIGNATURE", operation: "write", unique: SIGNATURE_UNIQUE }) ?? err;
    }
    await audit.record(tx, {
      tenantId: actor.tenantId, actorType: "TENANT_USER", userId: actor.userId, action: "SIGNATURE_CREATED",
      resourceType: "SIGNATURE", resourceId: row.id, newValue: { title: row.title, personName: row.personName },
    });
    return row;
  });
}

export async function updateSignature(db: DbOrTx, actor: Actor, id: string, input: Partial<SignatureInput>) {
  const { title, personName } = validateSignature(input, true);
  return inTransaction(db, async (tx) => {
    const existing = await getInTenant(tx, signatures, actor.tenantId, id, "SIGNATURE");
    if (input.signatureFileId) await assertFileReference(tx, actor.tenantId, input.signatureFileId, "SIGNATURE", "signatureFileId");
    let row;
    try {
      [row] = await tx
        .update(signatures)
        .set({
          title: title ?? existing.title,
          personName: personName ?? existing.personName,
          signatureFileId: input.signatureFileId === undefined ? existing.signatureFileId : input.signatureFileId,
          sortOrder: input.sortOrder ?? existing.sortOrder,
          updatedAt: new Date(),
          updatedBy: actor.userId,
        })
        .where(and(eq(signatures.tenantId, actor.tenantId), eq(signatures.id, id)))
        .returning();
    } catch (err) {
      throw mapDatabaseError(err, { entity: "SIGNATURE", operation: "write", unique: SIGNATURE_UNIQUE }) ?? err;
    }
    await audit.record(tx, {
      tenantId: actor.tenantId, actorType: "TENANT_USER", userId: actor.userId, action: "SIGNATURE_UPDATED", resourceType: "SIGNATURE", resourceId: id,
      oldValue: { title: existing.title, personName: existing.personName, signatureFileId: existing.signatureFileId },
      newValue: { title: row.title, personName: row.personName, signatureFileId: row.signatureFileId },
    });
    return row;
  });
}

export async function deleteSignature(db: DbOrTx, actor: Actor, id: string) {
  return inTransaction(db, async (tx) => {
    const existing = await getInTenant(tx, signatures, actor.tenantId, id, "SIGNATURE");
    await tx.delete(signatures).where(and(eq(signatures.tenantId, actor.tenantId), eq(signatures.id, id)));
    await audit.record(tx, {
      tenantId: actor.tenantId, actorType: "TENANT_USER", userId: actor.userId, action: "SIGNATURE_DELETED",
      resourceType: "SIGNATURE", resourceId: id, oldValue: { title: existing.title, personName: existing.personName },
    });
  });
}

// ---------------------------------------------------------------------------
// Student ID pattern (D8, D15, D16)
// ---------------------------------------------------------------------------

export interface StudentIdPatternView extends StudentIdPattern {
  /** What the next ID would look like, for the settings form. */
  example: string;
  isDefault: boolean;
}

const exampleId = (pattern: StudentIdPattern) =>
  formatStudentId(pattern, { courseCode: pattern.includeCourseCode ? "HSC" : null, year: new Date().getFullYear(), sequence: 1 });

export async function getStudentIdPattern(db: DbOrTx, tenantId: string): Promise<StudentIdPatternView> {
  const [row] = await db.select().from(studentIdSettings).where(eq(studentIdSettings.tenantId, tenantId));
  const pattern: StudentIdPattern = row
    ? { prefix: row.prefix, includeCourseCode: row.includeCourseCode, separator: row.separator as StudentIdPattern["separator"], sequenceWidth: row.sequenceWidth }
    : DEFAULT_STUDENT_ID_PATTERN;
  return { ...pattern, example: exampleId(pattern), isDefault: !row };
}

/** Changes the pattern for IDs issued from now on; existing IDs never change (D15). */
export async function saveStudentIdPattern(db: DbOrTx, actor: Actor, input: StudentIdPattern): Promise<StudentIdPatternView> {
  const pattern: StudentIdPattern = { ...input, prefix: input.prefix.trim().toUpperCase() };
  const problem = studentIdPatternProblem(pattern);
  if (problem) throw new ValidationError("VALIDATION_STUDENT_ID_PATTERN", problem);
  return inTransaction(db, async (tx) => {
    const before = await getStudentIdPattern(tx, actor.tenantId);
    await tx
      .insert(studentIdSettings)
      .values({ tenantId: actor.tenantId, ...pattern, updatedBy: actor.userId })
      .onConflictDoUpdate({ target: studentIdSettings.tenantId, set: { ...pattern, updatedAt: new Date(), updatedBy: actor.userId } });
    await audit.record(tx, {
      tenantId: actor.tenantId,
      actorType: "TENANT_USER",
      userId: actor.userId,
      action: "STUDENT_ID_PATTERN_UPDATED",
      resourceType: "STUDENT_ID_SETTINGS",
      resourceId: actor.tenantId,
      oldValue: before.isDefault ? null : { ...before, example: undefined, isDefault: undefined },
      newValue: { ...pattern },
    });
    return { ...pattern, example: exampleId(pattern), isDefault: false };
  });
}
