import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "../../core/testing/db";
import { auditLogs, files, signatures, tenants, users } from "../../core/db/schema";
import { uploadFile, type FileCategory } from "../../core/files/service";
import { LocalDiskStorage } from "../../core/files/storage";
import { createSignature, deleteSignature, getAppTheme, getAppearance, getInstitutionProfile, setAppTheme, getStudentIdPattern, listSignatures, saveInstitutionProfile, saveStudentIdPattern, updateSignature, type InstitutionProfileInput } from "./service";

const { db, reset, close } = createTestDb();
let storage: LocalDiskStorage;

beforeEach(async () => {
  await reset();
  storage = new LocalDiskStorage(await mkdtemp(path.join(os.tmpdir(), "sms-settings-")));
});
afterAll(async () => {
  await close();
});

let counter = 0;
async function school(name = "Green Valley School") {
  const [tenant] = await db.insert(tenants).values({ name, subdomain: `settings-${++counter}`, status: "ACTIVE" }).returning();
  const [user] = await db.insert(users).values({ tenantId: tenant.id, name: "Admin", username: `admin-${counter}` }).returning();
  const actor = { tenantId: tenant.id, userId: user.id };
  const upload = async (category: FileCategory) =>
    uploadFile(db, storage, actor, { category, filename: "x.png", bytes: await sharp({ create: { width: 40, height: 20, channels: 4, background: "#0000" } }).png().toBuffer() });
  return { actor, upload };
}

const profile = (o: Partial<InstitutionProfileInput> = {}): InstitutionProfileInput => ({
  displayName: "Green Valley High School", shortName: "GVHS", address: "Road 5, Dhaka", phone: "+880 1711-000000", email: "info@gvhs.edu.bd",
  website: "https://gvhs.edu.bd", institutionCode: "108765", logoFileId: null, primaryColor: "#1F6FEB", secondaryColor: null, ...o,
});

describe("institution profile", () => {
  it("falls back to the tenant name until saved, then returns the saved profile", async () => {
    const s = await school("Green Valley School");
    expect(await getInstitutionProfile(db, s.actor.tenantId)).toMatchObject({ displayName: "Green Valley School", isDefault: true, logoFileId: null });

    const logo = await s.upload("LOGO");
    const saved = await saveInstitutionProfile(db, s.actor, profile({ logoFileId: logo.id, shortName: "  GVHS  " }));
    // Colours are normalized to lower case; text is trimmed.
    expect(saved).toMatchObject({ shortName: "GVHS", primaryColor: "#1f6feb", logoFileId: logo.id, isDefault: false });
    expect(await getInstitutionProfile(db, s.actor.tenantId)).toEqual(saved);

    // Saving again updates the same row; an emptied field becomes null.
    const updated = await saveInstitutionProfile(db, s.actor, profile({ logoFileId: logo.id, website: "  " }));
    expect(updated.website).toBeNull();
    const audits = await db.select().from(auditLogs).where(eq(auditLogs.action, "INSTITUTION_PROFILE_UPDATED"));
    expect(audits).toHaveLength(2);
  });

  it.each([
    [{ displayName: "   " }, "VALIDATION_NAME"],
    [{ email: "not-an-email" }, "VALIDATION_EMAIL"],
    [{ website: "gvhs.edu.bd" }, "VALIDATION_WEBSITE"],
    [{ website: "javascript:alert(1)" }, "VALIDATION_WEBSITE"],
    [{ phone: "call me" }, "VALIDATION_PHONE"],
    [{ primaryColor: "blue" }, "VALIDATION_COLOR"],
    [{ secondaryColor: "#12345" }, "VALIDATION_COLOR"],
  ])("rejects %o", async (change, code) => {
    const s = await school();
    await expect(saveInstitutionProfile(db, s.actor, profile(change))).rejects.toMatchObject({ code });
  });

  it("accepts only its own school's LOGO file as the logo", async () => {
    const a = await school();
    const b = await school();
    await expect(saveInstitutionProfile(db, a.actor, profile({ logoFileId: (await b.upload("LOGO")).id }))).rejects.toMatchObject({ code: "VALIDATION_FILE_REFERENCE" });
    await expect(saveInstitutionProfile(db, a.actor, profile({ logoFileId: (await a.upload("SIGNATURE")).id }))).rejects.toMatchObject({ code: "VALIDATION_FILE_REFERENCE" });
  });

  it("keeps each school's profile separate", async () => {
    const a = await school("School A");
    const b = await school("School B");
    await saveInstitutionProfile(db, a.actor, profile({ displayName: "A High School" }));
    expect((await getInstitutionProfile(db, b.actor.tenantId)).displayName).toBe("School B");
  });

  it("clears the logo when its file is deleted", async () => {
    const s = await school();
    const logo = await s.upload("LOGO");
    await saveInstitutionProfile(db, s.actor, profile({ logoFileId: logo.id }));
    await db.delete(files).where(eq(files.id, logo.id));
    expect((await getInstitutionProfile(db, s.actor.tenantId)).logoFileId).toBeNull();
  });
});

describe("signatures", () => {
  it("creates, lists in order, updates and deletes signatories, with audit", async () => {
    const s = await school();
    const image = await s.upload("SIGNATURE");
    const principal = await createSignature(db, s.actor, { title: "Principal", personName: "Dr. Rahman", signatureFileId: image.id, sortOrder: 10 });
    await createSignature(db, s.actor, { title: "Exam Controller", personName: "Ms. Akter", sortOrder: 20 });
    expect((await listSignatures(db, s.actor.tenantId)).map((r) => r.title)).toEqual(["Principal", "Exam Controller"]);

    const renamed = await updateSignature(db, s.actor, principal.id, { personName: "Dr. M. Rahman", signatureFileId: null });
    expect(renamed).toMatchObject({ title: "Principal", personName: "Dr. M. Rahman", signatureFileId: null });

    await deleteSignature(db, s.actor, principal.id);
    expect((await listSignatures(db, s.actor.tenantId)).map((r) => r.title)).toEqual(["Exam Controller"]);
    const actions = (await db.select({ action: auditLogs.action }).from(auditLogs)).map((r) => r.action).filter((a) => a.startsWith("SIGNATURE_"));
    expect(actions.sort()).toEqual(["SIGNATURE_CREATED", "SIGNATURE_CREATED", "SIGNATURE_DELETED", "SIGNATURE_UPDATED"]);
  });

  it("refuses a duplicate title (case-insensitive), blanks, and another school's image", async () => {
    const a = await school();
    const b = await school();
    await createSignature(db, a.actor, { title: "Principal", personName: "X" });
    await expect(createSignature(db, a.actor, { title: "PRINCIPAL", personName: "Y" })).rejects.toMatchObject({ code: "CONFLICT_SIGNATURE_TITLE", status: 409 });
    await expect(createSignature(db, a.actor, { title: " ", personName: "Y" })).rejects.toMatchObject({ code: "VALIDATION_TITLE" });
    await expect(createSignature(db, a.actor, { title: "Head", personName: "" })).rejects.toMatchObject({ code: "VALIDATION_PERSON_NAME" });
    await expect(createSignature(db, a.actor, { title: "Head", personName: "Y", signatureFileId: (await b.upload("SIGNATURE")).id })).rejects.toMatchObject({ code: "VALIDATION_FILE_REFERENCE" });
    // The same title is fine in another school.
    await expect(createSignature(db, b.actor, { title: "Principal", personName: "Z" })).resolves.toBeTruthy();
  });

  it("never updates or deletes another school's signatory", async () => {
    const a = await school();
    const b = await school();
    const theirs = await createSignature(db, b.actor, { title: "Principal", personName: "B" });
    await expect(updateSignature(db, a.actor, theirs.id, { personName: "hijacked" })).rejects.toMatchObject({ status: 404 });
    await expect(deleteSignature(db, a.actor, theirs.id)).rejects.toMatchObject({ status: 404 });
    expect((await db.select().from(signatures).where(eq(signatures.id, theirs.id)))[0].personName).toBe("B");
  });
});

describe("student ID pattern", () => {
  it("starts with the defaults, saves a pattern with an example, and audits the change", async () => {
    const s = await school();
    const before = await getStudentIdPattern(db, s.actor.tenantId);
    expect(before).toMatchObject({ prefix: "", includeCourseCode: false, separator: "-", sequenceWidth: 4, isDefault: true });

    const saved = await saveStudentIdPattern(db, s.actor, { prefix: " kc ", includeCourseCode: true, separator: "-", sequenceWidth: 4 });
    expect(saved).toMatchObject({ prefix: "KC", includeCourseCode: true, isDefault: false });
    expect(saved.example).toBe(`KC-HSC-${new Date().getFullYear()}-0001`);
    expect(await getStudentIdPattern(db, s.actor.tenantId)).toEqual(saved);

    const audits = await db.select().from(auditLogs).where(eq(auditLogs.action, "STUDENT_ID_PATTERN_UPDATED"));
    expect(audits).toHaveLength(1);
  });

  it("refuses a bad pattern and never mixes up two institutes' patterns", async () => {
    const a = await school();
    const b = await school();
    await expect(saveStudentIdPattern(db, a.actor, { prefix: "1KC", includeCourseCode: false, separator: "-", sequenceWidth: 4 })).rejects.toMatchObject({
      code: "VALIDATION_STUDENT_ID_PATTERN",
    });
    await saveStudentIdPattern(db, a.actor, { prefix: "AAA", includeCourseCode: false, separator: "", sequenceWidth: 5 });
    expect((await getStudentIdPattern(db, b.actor.tenantId)).isDefault).toBe(true);
  });
});

describe("app theme", () => {
  it("is Midnight until chosen; a save keeps the profile's other details and is audited", async () => {
    const { actor } = await school();
    expect(await getAppTheme(db, actor.tenantId)).toBe("MIDNIGHT");

    // Before the profile is saved there is no row: one is made with the institute's name.
    await setAppTheme(db, { tenantId: actor.tenantId, theme: "PLUM", actor: { type: "TENANT_USER", userId: actor.userId } });
    expect(await getAppTheme(db, actor.tenantId)).toBe("PLUM");
    expect((await getInstitutionProfile(db, actor.tenantId)).displayName).toBe("Green Valley School");

    await saveInstitutionProfile(db, actor, profile());
    await setAppTheme(db, { tenantId: actor.tenantId, theme: "INDIGO", actor: { type: "TENANT_USER", userId: actor.userId } });
    expect(await getAppTheme(db, actor.tenantId)).toBe("INDIGO");
    expect((await getInstitutionProfile(db, actor.tenantId)).displayName).toBe("Green Valley High School");

    const entries = await db.select().from(auditLogs).where(eq(auditLogs.action, "APP_THEME_CHANGED"));
    expect(entries.map((e) => [e.oldValue, e.newValue, e.userId])).toEqual([
      [{ appTheme: "MIDNIGHT", paperBackground: null }, { appTheme: "PLUM", paperBackground: null }, actor.userId],
      [{ appTheme: "PLUM", paperBackground: null }, { appTheme: "INDIGO", paperBackground: null }, actor.userId],
    ]);
  });

  it("stores the paper background as automatic, on or off; leaving it out keeps it", async () => {
    const { actor } = await school();
    const by = { type: "TENANT_USER" as const, userId: actor.userId };
    expect(await getAppearance(db, actor.tenantId)).toEqual({ appTheme: "MIDNIGHT", paperBackground: null });
    await setAppTheme(db, { tenantId: actor.tenantId, theme: "MIDNIGHT", paper: true, actor: by });
    expect(await getAppearance(db, actor.tenantId)).toEqual({ appTheme: "MIDNIGHT", paperBackground: true });
    await setAppTheme(db, { tenantId: actor.tenantId, theme: "AMBER", actor: by });
    expect((await getAppearance(db, actor.tenantId)).paperBackground).toBe(true);
    await setAppTheme(db, { tenantId: actor.tenantId, theme: "AMBER", paper: false, actor: by });
    expect((await getAppearance(db, actor.tenantId)).paperBackground).toBe(false);
    await setAppTheme(db, { tenantId: actor.tenantId, theme: "AMBER", paper: null, actor: by });
    expect((await getAppearance(db, actor.tenantId)).paperBackground).toBeNull();
    const last = (await db.select().from(auditLogs).where(eq(auditLogs.action, "APP_THEME_CHANGED"))).at(-1);
    expect(last).toMatchObject({ oldValue: { paperBackground: false }, newValue: { paperBackground: null } });
  });

  it("refuses an unknown theme and changes only its own institute", async () => {
    const a = await school("A");
    const b = await school("B");
    await expect(setAppTheme(db, { tenantId: a.actor.tenantId, theme: "NEON" as never, actor: { type: "TENANT_USER", userId: a.actor.userId } })).rejects.toMatchObject({ status: 422 });
    await setAppTheme(db, { tenantId: a.actor.tenantId, theme: "EMERALD", actor: { type: "TENANT_USER", userId: a.actor.userId } });
    expect(await getAppTheme(db, b.actor.tenantId)).toBe("MIDNIGHT");
  });
});
