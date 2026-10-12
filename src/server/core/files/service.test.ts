import { mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "../testing/db";
import { files, tenants, users } from "../db/schema";
import { assertFileReference, canUpload, canViewFile, getFileInTenant, readFileBytes, uploadFile } from "./service";
import { LocalDiskStorage } from "./storage";

const { db, reset, close } = createTestDb();
let root: string;
let storage: LocalDiskStorage;

beforeEach(async () => {
  await reset();
  root = await mkdtemp(path.join(os.tmpdir(), "sms-files-"));
  storage = new LocalDiskStorage(root);
});
afterAll(async () => {
  await close();
});

let counter = 0;
async function tenantWithUser() {
  const [tenant] = await db.insert(tenants).values({ name: "School", subdomain: `files-${++counter}`, status: "ACTIVE" }).returning();
  const [user] = await db.insert(users).values({ tenantId: tenant.id, name: "Admin", username: `admin-${counter}` }).returning();
  return { tenantId: tenant.id, userId: user.id };
}

const image = (width: number, height: number, format: "jpeg" | "png" | "webp" = "jpeg") =>
  sharp({ create: { width, height, channels: 3, background: "#3366aa" } }).toFormat(format).toBuffer();

async function listStored(): Promise<string[]> {
  return (await readdir(root, { recursive: true, withFileTypes: true })).filter((d) => d.isFile()).map((d) => d.name);
}

describe("uploadFile", () => {
  it("stores a normalized photo under the tenant prefix and records it", async () => {
    const actor = await tenantWithUser();
    const row = await uploadFile(db, storage, actor, { category: "STUDENT_PHOTO", filename: "C:\\fakepath\\ রহিম.webp", bytes: await image(1200, 1500, "webp") });

    expect(row).toMatchObject({ tenantId: actor.tenantId, category: "STUDENT_PHOTO", mimeType: "image/jpeg", filename: "রহিম.jpg", uploadedBy: actor.userId });
    expect(row.objectKey).toBe(`${actor.tenantId}/student_photo/${row.id}.jpg`);
    const stored = await sharp(await readFileBytes(storage, row)).metadata();
    // Resized to fit 600 × 750, never enlarged.
    expect([stored.format, stored.width, stored.height]).toEqual(["jpeg", 600, 750]);
    expect(stored.exif).toBeUndefined();
  });

  it("never enlarges a small image, and keeps PNG for logos", async () => {
    const actor = await tenantWithUser();
    const row = await uploadFile(db, storage, actor, { category: "LOGO", filename: "logo.jpg", bytes: await image(120, 80) });
    const meta = await sharp(await readFileBytes(storage, row)).metadata();
    expect([row.mimeType, meta.format, meta.width, meta.height]).toEqual(["image/png", "png", 120, 80]);
  });

  it("applies the camera's orientation before stripping metadata", async () => {
    const actor = await tenantWithUser();
    // A 400 × 300 landscape frame that the camera marked as rotated 90° → an upright 300 × 400 photo.
    const rotated = await sharp({ create: { width: 400, height: 300, channels: 3, background: "#fff" } }).withMetadata({ orientation: 6 }).jpeg().toBuffer();
    const row = await uploadFile(db, storage, actor, { category: "INSTRUCTOR_PHOTO", filename: "phone.jpg", bytes: rotated });
    const meta = await sharp(await readFileBytes(storage, row)).metadata();
    expect([meta.width, meta.height, meta.orientation]).toEqual([300, 400, undefined]);
  });

  it("refuses non-images, SVG, empty and oversized files, and stores nothing", async () => {
    const actor = await tenantWithUser();
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><script>alert(1)</script></svg>');
    await expect(uploadFile(db, storage, actor, { category: "STUDENT_PHOTO", filename: "x.jpg", bytes: Buffer.from("not an image at all") })).rejects.toMatchObject({ code: "VALIDATION_FILE_TYPE" });
    await expect(uploadFile(db, storage, actor, { category: "LOGO", filename: "x.svg", bytes: svg })).rejects.toMatchObject({ code: "VALIDATION_FILE_TYPE" });
    await expect(uploadFile(db, storage, actor, { category: "LOGO", filename: "x.gif", bytes: await sharp({ create: { width: 4, height: 4, channels: 3, background: "#000" } }).gif().toBuffer() })).rejects.toMatchObject({ code: "VALIDATION_FILE_TYPE" });
    await expect(uploadFile(db, storage, actor, { category: "STUDENT_PHOTO", filename: "x.jpg", bytes: Buffer.alloc(0) })).rejects.toMatchObject({ code: "VALIDATION_FILE_EMPTY" });
    await expect(uploadFile(db, storage, actor, { category: "SIGNATURE", filename: "x.png", bytes: Buffer.alloc(1024 * 1024 + 1, 1) })).rejects.toMatchObject({ code: "VALIDATION_FILE_TOO_LARGE" });
    expect(await listStored()).toEqual([]);
    expect(await db.select().from(files)).toEqual([]);
  });

  it("refuses an image that claims enormous dimensions (decompression bomb)", async () => {
    const actor = await tenantWithUser();
    // Small on disk (a flat colour compresses well) but over the pixel limit.
    const bomb = await sharp({ create: { width: 8000, height: 6000, channels: 3, background: "#fff" } }).png({ compressionLevel: 9 }).toBuffer();
    expect(bomb.length).toBeLessThan(2 * 1024 * 1024);
    await expect(uploadFile(db, storage, actor, { category: "STUDENT_PHOTO", filename: "big.png", bytes: bomb })).rejects.toMatchObject({ code: "VALIDATION_FILE_TYPE" });
  });
});

describe("tenant scoping", () => {
  it("finds a file only in its own tenant, and checks references by tenant and category", async () => {
    const a = await tenantWithUser();
    const b = await tenantWithUser();
    const row = await uploadFile(db, storage, a, { category: "STUDENT_PHOTO", filename: "a.jpg", bytes: await image(100, 100) });

    await expect(getFileInTenant(db, a.tenantId, row.id)).resolves.toMatchObject({ id: row.id });
    await expect(getFileInTenant(db, b.tenantId, row.id)).rejects.toMatchObject({ status: 404 });

    await expect(assertFileReference(db, a.tenantId, row.id, "STUDENT_PHOTO", "photoFileId")).resolves.toBeUndefined();
    await expect(assertFileReference(db, b.tenantId, row.id, "STUDENT_PHOTO", "photoFileId")).rejects.toMatchObject({ code: "VALIDATION_FILE_REFERENCE" });
    await expect(assertFileReference(db, a.tenantId, row.id, "INSTRUCTOR_PHOTO", "photoFileId")).rejects.toMatchObject({ code: "VALIDATION_FILE_REFERENCE" });
  });
});

describe("permissions", () => {
  it("lets only the right roles upload each category", () => {
    expect(canUpload("STUDENT_PHOTO", new Set(["students.update"]))).toBe(true);
    expect(canUpload("STUDENT_PHOTO", new Set(["students.view"]))).toBe(false);
    expect(canUpload("INSTRUCTOR_PHOTO", new Set(["instructors.manage"]))).toBe(true);
    expect(canUpload("INSTRUCTOR_PHOTO", new Set(["students.update"]))).toBe(false);
    expect(canUpload("LOGO", new Set(["students.update", "instructors.manage"]))).toBe(false);
    expect(canUpload("SIGNATURE", new Set(["settings.manage"]))).toBe(true);
  });

  it("shows a photo to viewers of that kind of person; logos and signatures to everyone in the institute", async () => {
    const actor = await tenantWithUser();
    const viewer = (permissions: string[]) => ({ tenantId: actor.tenantId, userId: actor.userId, permissions: new Set(permissions) });
    const studentPhoto = await uploadFile(db, storage, actor, { category: "STUDENT_PHOTO", filename: "s.jpg", bytes: await image(100, 100) });
    expect(await canViewFile(db, viewer(["students.view"]), studentPhoto)).toBe(true);
    // Instructors see only their own batches' students' photos (D24; covered with real batches in students/http.test.ts).
    expect(await canViewFile(db, viewer(["batches.own.view"]), studentPhoto)).toBe(false);
    expect(await canViewFile(db, viewer([]), studentPhoto)).toBe(false);

    const instructorPhoto = await uploadFile(db, storage, actor, { category: "INSTRUCTOR_PHOTO", filename: "i.jpg", bytes: await image(100, 100) });
    expect(await canViewFile(db, viewer(["instructors.view"]), instructorPhoto)).toBe(true);
    expect(await canViewFile(db, viewer(["students.view"]), instructorPhoto)).toBe(false);

    const logo = await uploadFile(db, storage, actor, { category: "LOGO", filename: "l.png", bytes: await image(50, 50) });
    expect(await canViewFile(db, viewer([]), logo)).toBe(true);
  });
});

describe("LocalDiskStorage", () => {
  it("refuses keys that don't match the expected shape or escape the root", async () => {
    const t = "11111111-1111-1111-1111-111111111111";
    const f = "22222222-2222-2222-2222-222222222222";
    await expect(storage.put(`../${t}/logo/${f}.png`, Buffer.from("x"))).rejects.toThrow("Invalid storage key");
    await expect(storage.put(`${t}/../../etc/${f}.png`, Buffer.from("x"))).rejects.toThrow("Invalid storage key");
    await expect(storage.get(`${t}/logo/${f}.exe`)).rejects.toThrow("Invalid storage key");
    await storage.put(`${t}/logo/${f}.png`, Buffer.from("x"));
    expect((await storage.get(`${t}/logo/${f}.png`))?.toString()).toBe("x");
    await storage.delete(`${t}/logo/${f}.png`);
    expect(await storage.get(`${t}/logo/${f}.png`)).toBeNull();
    await rm(root, { recursive: true, force: true });
  });
});
