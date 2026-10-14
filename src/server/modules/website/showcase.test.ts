import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "../../core/testing/db";
import { setModules } from "../../core/testing/modules";
import { batchSubjectInstructors, batchSubjects, batches, courses, instructors, subjects, tenants, users } from "../../core/db/schema";
import type { Db } from "../../core/db/types";
import { seedPlatformCatalog } from "../../core/db/seed";
import { uploadFile, type FileCategory } from "../../core/files/service";
import { LocalDiskStorage } from "../../core/files/storage";
import { getPublicWebsite, isPublicWebsiteImage } from "./public";
import * as showcase from "./showcase";

const { db: testDb, reset, close } = createTestDb();
const db = testDb as unknown as Db;
let storage: LocalDiskStorage;

beforeEach(async () => {
  await reset();
  await seedPlatformCatalog(testDb);
  storage = new LocalDiskStorage(await mkdtemp(path.join(os.tmpdir(), "cms-website-showcase-")));
});
afterAll(async () => {
  await close();
});

let counter = 0;
async function institute() {
  const n = ++counter;
  const [tenant] = await testDb.insert(tenants).values({ name: `Showcase ${n}`, subdomain: `showcase-${n}`, status: "ACTIVE" }).returning();
  const [user] = await testDb.insert(users).values({ tenantId: tenant.id, name: "Admin", username: `admin-${n}` }).returning();
  const actor = { tenantId: tenant.id, userId: user.id };
  const picture = async (category: FileCategory = "WEBSITE_IMAGE") =>
    uploadFile(db, storage, actor, { category, filename: "p.jpg", bytes: await sharp({ create: { width: 40, height: 30, channels: 3, background: "#888" } }).jpeg().toBuffer() });
  let people = 0;
  /** An instructor teaching `subjectNames` in one active batch (and "Retired subject" in an archived one). */
  const instructor = async (name: string, subjectNames: string[] = [], photoFileId: string | null = null) => {
    const [login] = await testDb.insert(users).values({ tenantId: tenant.id, name, username: `t-${n}-${++people}` }).returning();
    const [row] = await testDb.insert(instructors).values({ tenantId: tenant.id, userId: login.id, fullName: name, photoFileId }).returning();
    if (subjectNames.length) {
      const [course] = await testDb.insert(courses).values({ tenantId: tenant.id, name: `Course ${people}`, code: `C${people}` }).returning();
      const [active] = await testDb.insert(batches).values({ tenantId: tenant.id, courseId: course.id, name: "Morning" }).returning();
      const [archived] = await testDb.insert(batches).values({ tenantId: tenant.id, courseId: course.id, name: "Old", status: "ARCHIVED" }).returning();
      for (const [batch, names] of [[active, subjectNames], [archived, ["Retired subject"]]] as const) {
        for (const subjectName of names) {
          const [subject] = await testDb.insert(subjects).values({ tenantId: tenant.id, courseId: course.id, name: subjectName }).returning();
          const [bs] = await testDb.insert(batchSubjects).values({ tenantId: tenant.id, courseId: course.id, batchId: batch.id, subjectId: subject.id }).returning();
          await testDb.insert(batchSubjectInstructors).values({ tenantId: tenant.id, batchSubjectId: bs.id, instructorId: row.id });
        }
      }
    }
    return row;
  };
  return { tenantId: tenant.id, actor, picture, instructor };
}

describe("faculty (D141)", () => {
  it("shows only the instructors the office adds, in order, with subjects from active batches and never contact details", async () => {
    const s = await institute();
    const photo = await s.picture("INSTRUCTOR_PHOTO");
    const rahim = await s.instructor("Rahim Uddin", ["Physics", "Chemistry"], photo.id);
    const karim = await s.instructor("Karim Ali", ["Maths"]);
    await s.instructor("Not shown");

    expect((await showcase.facultyCandidates(db, s.tenantId)).map((c) => c.name)).toEqual(["Karim Ali", "Not shown", "Rahim Uddin"]);
    const a = await showcase.addFaculty(db, s.actor, { instructorId: rahim.id, line: "  BUET, 8 years  " });
    const b = await showcase.addFaculty(db, s.actor, { instructorId: karim.id });
    expect(a.line).toBe("BUET, 8 years");
    expect((await showcase.facultyCandidates(db, s.tenantId)).map((c) => c.name)).toEqual(["Not shown"]);

    await showcase.reorderFaculty(db, s.actor, [b.id, a.id]);
    const shown = await showcase.publicFaculty(db, s.tenantId);
    expect(shown).toEqual([
      { id: b.id, name: "Karim Ali", photoFileId: null, line: null, subjects: ["Maths"] },
      { id: a.id, name: "Rahim Uddin", photoFileId: photo.id, line: "BUET, 8 years", subjects: ["Chemistry", "Physics"] },
    ]);
    expect(Object.keys(shown[0]).sort()).toEqual(["id", "line", "name", "photoFileId", "subjects"]);

    await setModules(db, s.tenantId, ["website"]);
    expect((await getPublicWebsite(db, s.tenantId))?.faculty.map((f) => f.name)).toEqual(["Karim Ali", "Rahim Uddin"]);
  });

  it("refuses an instructor twice, an inactive one, and another institute's", async () => {
    const s = await institute();
    const other = await institute();
    const t = await s.instructor("Rahim");
    const gone = await s.instructor("Gone");
    await testDb.update(instructors).set({ status: "INACTIVE" }).where(eq(instructors.id, gone.id));
    const foreign = await other.instructor("Foreign");

    await showcase.addFaculty(db, s.actor, { instructorId: t.id });
    await expect(showcase.addFaculty(db, s.actor, { instructorId: t.id })).rejects.toMatchObject({ code: "CONFLICT_FACULTY_EXISTS" });
    await expect(showcase.addFaculty(db, s.actor, { instructorId: gone.id })).rejects.toMatchObject({ code: "VALIDATION_INSTRUCTOR_INACTIVE" });
    await expect(showcase.addFaculty(db, s.actor, { instructorId: foreign.id })).rejects.toMatchObject({ status: 404 });
    await expect(showcase.addFaculty(db, s.actor, { instructorId: t.id, line: "x".repeat(121) })).rejects.toMatchObject({ code: "VALIDATION_TEXT" });
  });

  it("hides an instructor who becomes inactive, and makes their photo public only while shown", async () => {
    const s = await institute();
    const photo = await s.picture("INSTRUCTOR_PHOTO");
    const t = await s.instructor("Rahim", [], photo.id);
    expect(await isPublicWebsiteImage(db, s.tenantId, photo.id)).toBe(false); // not on the website yet

    const row = await showcase.addFaculty(db, s.actor, { instructorId: t.id });
    expect(await isPublicWebsiteImage(db, s.tenantId, photo.id)).toBe(true);

    await testDb.update(instructors).set({ status: "INACTIVE" }).where(eq(instructors.id, t.id));
    expect(await showcase.publicFaculty(db, s.tenantId)).toEqual([]);
    expect(await isPublicWebsiteImage(db, s.tenantId, photo.id)).toBe(false);
    expect((await showcase.listFaculty(db, s.tenantId))[0]).toMatchObject({ status: "INACTIVE" }); // the office still sees them

    await testDb.update(instructors).set({ status: "ACTIVE" }).where(eq(instructors.id, t.id));
    await showcase.removeFaculty(db, s.actor, row.id);
    expect(await isPublicWebsiteImage(db, s.tenantId, photo.id)).toBe(false);
    expect(await testDb.select().from(instructors).where(eq(instructors.id, t.id))).toHaveLength(1); // the instructor stays
  });

  it("answers 404 for another institute's faculty row, and refuses a stale order", async () => {
    const s = await institute();
    const other = await institute();
    const row = await showcase.addFaculty(db, other.actor, { instructorId: (await other.instructor("Foreign")).id });
    await expect(showcase.updateFaculty(db, s.actor, row.id, { line: "x" })).rejects.toMatchObject({ status: 404 });
    await expect(showcase.removeFaculty(db, s.actor, row.id)).rejects.toMatchObject({ status: 404 });
    await expect(showcase.reorderFaculty(db, s.actor, [row.id])).rejects.toMatchObject({ code: "VALIDATION_ORDER" });
  });
});

describe("achievers (D141)", () => {
  it("adds, edits, orders and removes achievers; their photos are public while used", async () => {
    const s = await institute();
    const photo = await s.picture();
    const a = await showcase.createAchiever(db, s.actor, { name: "  Nusrat Jahan ", result: "GPA 5.00", exam: "SSC 2025", photoFileId: photo.id });
    const b = await showcase.createAchiever(db, s.actor, { name: "Rafi", result: "Merit 12" });
    expect(a).toMatchObject({ name: "Nusrat Jahan", result: "GPA 5.00", exam: "SSC 2025" });
    expect(await isPublicWebsiteImage(db, s.tenantId, photo.id)).toBe(true);

    await showcase.updateAchiever(db, s.actor, b.id, { name: "Rafi Hasan", result: "Merit 12", exam: "HSC 2025" });
    await showcase.reorderAchievers(db, s.actor, [b.id, a.id]);
    await setModules(db, s.tenantId, ["website"]);
    expect((await getPublicWebsite(db, s.tenantId))?.achievers.map((x) => `${x.name} ${x.exam}`)).toEqual(["Rafi Hasan HSC 2025", "Nusrat Jahan SSC 2025"]);

    await showcase.removeAchiever(db, s.actor, a.id);
    expect(await isPublicWebsiteImage(db, s.tenantId, photo.id)).toBe(false);
  });

  it.each([
    [{ name: "", result: "GPA 5" }, "VALIDATION_REQUIRED"],
    [{ name: "A", result: "" }, "VALIDATION_REQUIRED"],
    [{ name: "A", result: "x".repeat(81) }, "VALIDATION_TEXT"],
    [{ name: "A", result: "GPA 5", exam: "x".repeat(41) }, "VALIDATION_TEXT"],
  ])("refuses %o", async (input, code) => {
    const s = await institute();
    await expect(showcase.createAchiever(db, s.actor, input)).rejects.toMatchObject({ code });
  });

  it("takes only this institute's website pictures, answers 404 across institutes, and stops at the limit", async () => {
    const s = await institute();
    const other = await institute();
    const logo = await s.picture("LOGO");
    const foreignPicture = await other.picture();
    await expect(showcase.createAchiever(db, s.actor, { name: "A", result: "GPA 5", photoFileId: logo.id })).rejects.toMatchObject({ code: "VALIDATION_FILE_REFERENCE" });
    await expect(showcase.createAchiever(db, s.actor, { name: "A", result: "GPA 5", photoFileId: foreignPicture.id })).rejects.toMatchObject({ code: "VALIDATION_FILE_REFERENCE" });

    const theirs = await showcase.createAchiever(db, other.actor, { name: "B", result: "GPA 5" });
    await expect(showcase.updateAchiever(db, s.actor, theirs.id, { name: "x", result: "y" })).rejects.toMatchObject({ status: 404 });
    await expect(showcase.removeAchiever(db, s.actor, theirs.id)).rejects.toMatchObject({ status: 404 });

    for (let i = 0; i < showcase.MAX_ACHIEVERS; i++) await showcase.createAchiever(db, s.actor, { name: `S${i}`, result: "GPA 5" });
    await expect(showcase.createAchiever(db, s.actor, { name: "One more", result: "GPA 5" })).rejects.toMatchObject({ code: "CONFLICT_ACHIEVERS_FULL" });
  });
});
