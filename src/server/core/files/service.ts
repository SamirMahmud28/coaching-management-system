import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { and, eq } from "drizzle-orm";
import { files } from "../db/schema";
import type { DbOrTx } from "../db/types";
import { NotFoundError, ValidationError } from "../errors";
import type { PermissionName } from "../rbac/catalog";
import type { StorageProvider } from "./storage";

export type FileCategory = (typeof files.$inferSelect)["category"];
export type FileRow = typeof files.$inferSelect;

interface CategoryRule {
  maxBytes: number;
  /** The processed image always fits within these, and is never enlarged. */
  maxWidth: number;
  maxHeight: number;
  /** Photos become JPEG; logos and signatures keep transparency as PNG. */
  output: "jpg" | "png";
  /** Any one of these may upload a file of this category. */
  uploadPermissions: readonly PermissionName[];
}

const MB = 1024 * 1024;

// FILE-STORAGE-ARCHITECTURE.md §4 / VALIDATION.md: jpg, png or webp in; at most 2 MB. Sized for print (~300 dpi at card size).
export const FILE_RULES: Record<FileCategory, CategoryRule> = {
  STUDENT_PHOTO: { maxBytes: 2 * MB, maxWidth: 600, maxHeight: 750, output: "jpg", uploadPermissions: ["students.create", "students.update"] },
  INSTRUCTOR_PHOTO: { maxBytes: 2 * MB, maxWidth: 600, maxHeight: 750, output: "jpg", uploadPermissions: ["instructors.manage"] },
  LOGO: { maxBytes: 2 * MB, maxWidth: 800, maxHeight: 800, output: "png", uploadPermissions: ["settings.manage"] },
  SIGNATURE: { maxBytes: 1 * MB, maxWidth: 800, maxHeight: 300, output: "png", uploadPermissions: ["settings.manage"] },
};

const ACCEPTED_FORMATS = new Set(["jpeg", "png", "webp"]);
// Refuse decompression bombs: a 2 MB file can still claim enormous dimensions.
const MAX_INPUT_PIXELS = 40_000_000;

export function canUpload(category: FileCategory, permissions: ReadonlySet<string>): boolean {
  return FILE_RULES[category].uploadPermissions.some((p) => permissions.has(p));
}

function safeFilename(name: string, ext: string): string {
  const base = (name.split(/[\\/]/).pop() ?? "")
    .replace(/[\u0000-\u001f\u007f"<>|?*:]/g, "")
    .replace(/\.[^.]*$/, "")
    .trim()
    .slice(0, 150);
  return `${base || "file"}.${ext}`;
}

/** Decodes the real image (never trusting the declared type), then resizes, re-encodes and strips metadata. */
async function normalizeImage(bytes: Buffer, rule: CategoryRule): Promise<Buffer> {
  let format: string | undefined;
  try {
    format = (await sharp(bytes, { limitInputPixels: MAX_INPUT_PIXELS }).metadata()).format;
  } catch {
    throw new ValidationError("VALIDATION_FILE_TYPE", "This file isn't a readable image. Use a JPG, PNG or WebP picture.", { field: "file" });
  }
  if (!format || !ACCEPTED_FORMATS.has(format)) {
    throw new ValidationError("VALIDATION_FILE_TYPE", "Only JPG, PNG or WebP pictures can be uploaded.", { field: "file" });
  }
  const pipeline = sharp(bytes, { limitInputPixels: MAX_INPUT_PIXELS })
    .rotate() // apply the camera's orientation before metadata is dropped
    .resize({ width: rule.maxWidth, height: rule.maxHeight, fit: "inside", withoutEnlargement: true });
  return rule.output === "jpg" ? pipeline.flatten({ background: "#ffffff" }).jpeg({ quality: 85, mozjpeg: true }).toBuffer() : pipeline.png({ compressionLevel: 9 }).toBuffer();
}

export interface UploadInput {
  category: FileCategory;
  filename: string;
  bytes: Buffer;
}

/** Validates, normalizes and stores an image for the tenant; returns the `files` row. The caller checks `canUpload`. */
export async function uploadFile(db: DbOrTx, storage: StorageProvider, actor: { tenantId: string; userId: string }, input: UploadInput): Promise<FileRow> {
  const rule = FILE_RULES[input.category];
  if (input.bytes.length === 0) throw new ValidationError("VALIDATION_FILE_EMPTY", "The file is empty.", { field: "file" });
  if (input.bytes.length > rule.maxBytes) {
    throw new ValidationError("VALIDATION_FILE_TOO_LARGE", `The file is too large. The limit is ${rule.maxBytes / MB} MB.`, { field: "file" });
  }
  const processed = await normalizeImage(input.bytes, rule);

  const id = randomUUID();
  const objectKey = `${actor.tenantId}/${input.category.toLowerCase()}/${id}.${rule.output}`;
  await storage.put(objectKey, processed);
  try {
    const [row] = await db
      .insert(files)
      .values({
        id,
        tenantId: actor.tenantId,
        category: input.category,
        objectKey,
        filename: safeFilename(input.filename, rule.output),
        mimeType: rule.output === "jpg" ? "image/jpeg" : "image/png",
        size: processed.length,
        uploadedBy: actor.userId,
      })
      .returning();
    return row;
  } catch (err) {
    // Don't leave an orphaned object behind when the row can't be written.
    await storage.delete(objectKey).catch(() => undefined);
    throw err;
  }
}

/** The file, only if it belongs to the tenant; otherwise 404 (ids of other tenants can't be probed). */
export async function getFileInTenant(db: DbOrTx, tenantId: string, id: string): Promise<FileRow> {
  const [row] = await db.select().from(files).where(and(eq(files.tenantId, tenantId), eq(files.id, id)));
  if (!row) throw new NotFoundError("FILE");
  return row;
}

export async function readFileBytes(storage: StorageProvider, row: FileRow): Promise<Buffer> {
  const bytes = await storage.get(row.objectKey);
  if (!bytes) throw new NotFoundError("FILE");
  return bytes;
}

/**
 * Who may view a file. Photos: whoever may view that kind of person, and instructors for their own batches' students
 * (D24). A person's own photo (student or instructor portal) is added once those records exist (M5, M6). Logos and
 * signatures print on documents anyone in the institute can open.
 */
export async function canViewFile(_db: DbOrTx, viewer: { tenantId: string; userId: string; permissions: ReadonlySet<string> }, file: FileRow): Promise<boolean> {
  switch (file.category) {
    case "LOGO":
    case "SIGNATURE":
      return true;
    case "STUDENT_PHOTO":
      return ["students.view", "batches.own.view"].some((p) => viewer.permissions.has(p));
    case "INSTRUCTOR_PHOTO":
      return viewer.permissions.has("instructors.view");
  }
}

/**
 * Checks a file id about to be stored on a record (e.g. `students.photo_file_id`): same tenant and the expected
 * category. The FK alone can't enforce the tenant, since a composite key would break ON DELETE SET NULL.
 */
export async function assertFileReference(db: DbOrTx, tenantId: string, fileId: string, category: FileCategory, field: string) {
  const [row] = await db.select({ category: files.category }).from(files).where(and(eq(files.tenantId, tenantId), eq(files.id, fileId)));
  if (!row || row.category !== category) {
    throw new ValidationError("VALIDATION_FILE_REFERENCE", "That picture isn't available. Upload it again.", { field });
  }
}
