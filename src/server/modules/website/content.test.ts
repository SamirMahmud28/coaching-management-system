import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "../../core/testing/db";
import { setModules } from "../../core/testing/modules";
import { galleryPhotos, tenants, users } from "../../core/db/schema";
import type { Db } from "../../core/db/types";
import { seedPlatformCatalog } from "../../core/db/seed";
import { uploadFile, type FileCategory } from "../../core/files/service";
import { LocalDiskStorage } from "../../core/files/storage";
import { addDays, todayInDhaka } from "@/lib/dates";
import * as content from "./content";
import { getPublicWebsite } from "./public";

const { db: testDb, reset, close } = createTestDb();
const db = testDb as unknown as Db;
let storage: LocalDiskStorage;
const today = todayInDhaka();

beforeEach(async () => {
  await reset();
  await seedPlatformCatalog(testDb);
  storage = new LocalDiskStorage(await mkdtemp(path.join(os.tmpdir(), "cms-website-content-")));
});
afterAll(async () => {
  await close();
});

let counter = 0;
async function institute() {
  const [tenant] = await testDb.insert(tenants).values({ name: `Content ${++counter}`, subdomain: `content-${counter}`, status: "ACTIVE" }).returning();
  const [user] = await testDb.insert(users).values({ tenantId: tenant.id, name: "Admin", username: `admin-${counter}` }).returning();
  const actor = { tenantId: tenant.id, userId: user.id };
  const picture = async (category: FileCategory = "WEBSITE_IMAGE") =>
    uploadFile(db, storage, actor, { category, filename: "p.jpg", bytes: await sharp({ create: { width: 40, height: 30, channels: 3, background: "#888" } }).jpeg().toBuffer() });
  return { tenantId: tenant.id, actor, picture };
}

describe("notices (D128)", () => {
  it("shows a notice from its date until 'show until', pinned first then newest; hidden ones stay in the office list", async () => {
    const s = await institute();
    const old = await content.createNotice(db, s.actor, { title: "Old", body: "x", noticeDate: addDays(today, -10) });
    const pinned = await content.createNotice(db, s.actor, { title: "Pinned", body: "x", noticeDate: addDays(today, -20), pinned: true });
    const fresh = await content.createNotice(db, s.actor, { title: "Fresh", body: "x" });
    const expired = await content.createNotice(db, s.actor, { title: "Expired", body: "x", noticeDate: addDays(today, -5), showUntil: addDays(today, -1) });
    const lastDay = await content.createNotice(db, s.actor, { title: "Last day", body: "x", noticeDate: addDays(today, -5), showUntil: today });
    const scheduled = await content.createNotice(db, s.actor, { title: "Scheduled", body: "x", noticeDate: addDays(today, 3) });
    const hidden = await content.setNoticeHidden(db, s.actor, (await content.createNotice(db, s.actor, { title: "Hidden", body: "x" })).id, true);

    expect(fresh.noticeDate).toBe(today); // defaults to today
    expect([expired, scheduled, hidden, lastDay].map((n) => n.status)).toEqual(["EXPIRED", "SCHEDULED", "HIDDEN", "ON_WEBSITE"]);
    expect((await content.publicNotices(db, s.tenantId)).map((n) => n.title)).toEqual(["Pinned", "Fresh", "Last day", "Old"]);
    expect(await content.listNotices(db, s.tenantId)).toHaveLength(7);
    expect(old.status).toBe("ON_WEBSITE");
    expect(pinned.pinned).toBe(true);

    const shown = await content.setNoticeHidden(db, s.actor, hidden.id, false);
    expect(shown.status).toBe("ON_WEBSITE");
    await expect(content.setNoticeHidden(db, s.actor, hidden.id, false)).rejects.toMatchObject({ code: "CONFLICT_NOTICE_STATE" });
  });

  it("shows at most ten notices on the website", async () => {
    const s = await institute();
    for (let i = 0; i < 12; i++) await content.createNotice(db, s.actor, { title: `N${i}`, body: "x", noticeDate: addDays(today, -i) });
    expect(await content.publicNotices(db, s.tenantId)).toHaveLength(content.PUBLIC_NOTICE_LIMIT);
  });

  it.each([
    [{ title: " ", body: "x" }, "VALIDATION_REQUIRED"],
    [{ title: "T", body: "" }, "VALIDATION_REQUIRED"],
    [{ title: "x".repeat(151), body: "x" }, "VALIDATION_TEXT"],
    [{ title: "T", body: "x", noticeDate: "2026-02-30" }, "VALIDATION_DATE"],
    [{ title: "T", body: "x", noticeDate: "2026-03-10", showUntil: "2026-03-09" }, "VALIDATION_DATE_ORDER"],
  ])("refuses %o", async (input, code) => {
    const s = await institute();
    await expect(content.createNotice(db, s.actor, input)).rejects.toMatchObject({ code });
  });

  it("edits a notice; another institute's notice is not found", async () => {
    const s = await institute();
    const other = await institute();
    const n = await content.createNotice(db, s.actor, { title: "Admission open", body: "x" });
    expect((await content.updateNotice(db, s.actor, n.id, { title: "Admission closes Friday", body: "y", pinned: true })).title).toBe("Admission closes Friday");
    await expect(content.updateNotice(db, other.actor, n.id, { title: "Hijack", body: "x" })).rejects.toMatchObject({ code: "NOT_FOUND_NOTICE" });
    await expect(content.setNoticeHidden(db, other.actor, n.id, true)).rejects.toMatchObject({ code: "NOT_FOUND_NOTICE" });
  });
});

describe("gallery (D125)", () => {
  it("adds website pictures at the end, edits captions, reorders and removes", async () => {
    const s = await institute();
    const [a, b, c] = [await s.picture(), await s.picture(), await s.picture()];
    const pa = await content.addGalleryPhoto(db, s.actor, { fileId: a.id, caption: "  Prize day  " });
    const pb = await content.addGalleryPhoto(db, s.actor, { fileId: b.id });
    const pc = await content.addGalleryPhoto(db, s.actor, { fileId: c.id });
    expect(pa.caption).toBe("Prize day");
    await expect(content.addGalleryPhoto(db, s.actor, { fileId: a.id })).rejects.toMatchObject({ code: "CONFLICT_GALLERY_DUPLICATE" });

    await content.reorderGallery(db, s.actor, [pc.id, pa.id, pb.id]);
    expect((await content.listGallery(db, s.tenantId)).map((p) => p.id)).toEqual([pc.id, pa.id, pb.id]);
    await expect(content.reorderGallery(db, s.actor, [pc.id, pa.id])).rejects.toMatchObject({ code: "VALIDATION_ORDER" });
    await expect(content.reorderGallery(db, s.actor, [pc.id, pa.id, pa.id])).rejects.toMatchObject({ code: "VALIDATION_ORDER" });

    expect((await content.updateGalleryCaption(db, s.actor, pb.id, "Science fair")).caption).toBe("Science fair");
    await content.removeGalleryPhoto(db, s.actor, pa.id);
    expect((await content.listGallery(db, s.tenantId)).map((p) => p.id)).toEqual([pc.id, pb.id]);
  });

  it("holds at most 60 photos", async () => {
    const s = await institute();
    const file = await s.picture();
    // Fill to the limit directly; each row needs its own picture only in the service.
    await testDb.insert(galleryPhotos).values(Array.from({ length: content.MAX_GALLERY_PHOTOS }, (_, i) => ({ tenantId: s.tenantId, fileId: file.id, sortOrder: i + 1, createdBy: s.actor.userId })));
    await expect(content.addGalleryPhoto(db, s.actor, { fileId: (await s.picture()).id })).rejects.toMatchObject({ code: "CONFLICT_GALLERY_FULL" });
  });

  it("takes only website pictures of the same institute; another institute's photo is not found", async () => {
    const s = await institute();
    const other = await institute();
    await expect(content.addGalleryPhoto(db, s.actor, { fileId: (await s.picture("LOGO")).id })).rejects.toMatchObject({ code: "VALIDATION_FILE_REFERENCE" });
    await expect(content.addGalleryPhoto(db, s.actor, { fileId: (await other.picture()).id })).rejects.toMatchObject({ code: "VALIDATION_FILE_REFERENCE" });
    const theirs = await content.addGalleryPhoto(db, other.actor, { fileId: (await other.picture()).id });
    await expect(content.removeGalleryPhoto(db, s.actor, theirs.id)).rejects.toMatchObject({ code: "NOT_FOUND_GALLERY_PHOTO" });
    await expect(content.updateGalleryCaption(db, s.actor, theirs.id, "x")).rejects.toMatchObject({ code: "NOT_FOUND_GALLERY_PHOTO" });
  });
});

describe("testimonials (D130)", () => {
  it("adds them in order with an optional line and photo, edits, reorders and removes", async () => {
    const s = await institute();
    const photo = await s.picture();
    const t1 = await content.createTestimonial(db, s.actor, { quote: "Best teachers.", name: "Anika", line: "HSC 2025, GPA 5", photoFileId: photo.id });
    const t2 = await content.createTestimonial(db, s.actor, { quote: "Weekly tests helped.", name: "Rafi" });
    expect([t1.sortOrder, t2.sortOrder]).toEqual([1, 2]);
    await content.reorderTestimonials(db, s.actor, [t2.id, t1.id]);
    expect((await content.listTestimonials(db, s.tenantId)).map((t) => t.name)).toEqual(["Rafi", "Anika"]);
    expect((await content.updateTestimonial(db, s.actor, t2.id, { quote: "Weekly tests helped a lot.", name: "Rafi", line: "SSC 2026" })).line).toBe("SSC 2026");
    await content.removeTestimonial(db, s.actor, t1.id);
    expect(await content.listTestimonials(db, s.tenantId)).toHaveLength(1);
  });

  it.each([
    [{ quote: " ", name: "A" }, "VALIDATION_REQUIRED"],
    [{ quote: "Q", name: "" }, "VALIDATION_REQUIRED"],
    [{ quote: "x".repeat(601), name: "A" }, "VALIDATION_TEXT"],
  ])("refuses %o", async (input, code) => {
    const s = await institute();
    await expect(content.createTestimonial(db, s.actor, input)).rejects.toMatchObject({ code });
  });

  it("refuses another institute's picture and another institute's testimonial", async () => {
    const s = await institute();
    const other = await institute();
    await expect(content.createTestimonial(db, s.actor, { quote: "Q", name: "A", photoFileId: (await other.picture()).id })).rejects.toMatchObject({ code: "VALIDATION_FILE_REFERENCE" });
    const theirs = await content.createTestimonial(db, other.actor, { quote: "Q", name: "B" });
    await expect(content.updateTestimonial(db, s.actor, theirs.id, { quote: "Q", name: "A" })).rejects.toMatchObject({ code: "NOT_FOUND_TESTIMONIAL" });
    await expect(content.removeTestimonial(db, s.actor, theirs.id)).rejects.toMatchObject({ code: "NOT_FOUND_TESTIMONIAL" });
  });
});

describe("on the public website", () => {
  it("includes the shown notices, the gallery and testimonials in order", async () => {
    const s = await institute();
    await setModules(db, s.tenantId, ["website"]);
    await content.createNotice(db, s.actor, { title: "Admission open", body: "x" });
    await content.createNotice(db, s.actor, { title: "Gone", body: "x", noticeDate: addDays(today, -3), showUntil: addDays(today, -1) });
    await content.addGalleryPhoto(db, s.actor, { fileId: (await s.picture()).id, caption: "Prize day" });
    await content.createTestimonial(db, s.actor, { quote: "Q", name: "Anika" });
    const site = await getPublicWebsite(db, s.tenantId);
    expect(site?.notices.map((n) => n.title)).toEqual(["Admission open"]);
    expect(site?.gallery.map((p) => p.caption)).toEqual(["Prize day"]);
    expect(site?.testimonials.map((t) => t.name)).toEqual(["Anika"]);
  });
});
