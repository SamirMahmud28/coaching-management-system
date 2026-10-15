import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { and, eq, exists } from "drizzle-orm";
import { batchMemberships, batchSubjectInstructors, batchSubjects, files, instructors, students } from "../db/schema";
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

// Accepted uploads: jpg, png or webp in; at most 2 MB. Sized for print (~300 dpi at card size).
export const FILE_RULES: Record<FileCategory, CategoryRule> = {
  STUDENT_PHOTO: { maxBytes: 2 * MB, maxWidth: 600, maxHeight: 750, output: "jpg", uploadPermissions: ["students.create", "students.update"] },
  INSTRUCTOR_PHOTO: { maxBytes: 2 * MB, maxWidth: 600, maxHeight: 750, output: "jpg", uploadPermissions: ["instructors.manage"] },
  LOGO: { maxBytes: 2 * MB, maxWidth: 800, maxHeight: 800, output: "png", uploadPermissions: ["settings.manage"] },
  SIGNATURE: { maxBytes: 1 * MB, maxWidth: 800, maxHeight: 300, output: "png", uploadPermissions: ["settings.manage"] },
  // Hero, about, gallery and testimonial pictures on the public website.
  WEBSITE_IMAGE: { maxBytes: 5 * MB, maxWidth: 1600, maxHeight: 1600, output: "jpg", uploadPermissions: ["website.manage"] },
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
 * Who may view a file. Photos: whoever may view that kind of person, the person themself, and instructors for students
 * currently in a batch they teach. Logos and signatures print on documents anyone in the institute can open; website pictures are public.
 */
export async function canViewFile(db: DbOrTx, viewer: { tenantId: string; userId: string; permissions: ReadonlySet<string> }, file: FileRow): Promise<boolean> {
  switch (file.category) {
    case "LOGO":
    case "SIGNATURE":
    case "WEBSITE_IMAGE": // public on the website anyway
      return true;
    case "STUDENT_PHOTO": {
      if (viewer.permissions.has("students.view")) return true;
      const own = and(eq(students.tenantId, viewer.tenantId), eq(students.photoFileId, file.id), eq(students.userId, viewer.userId));
      const taught = exists(
        db
          .select({ one: batchMemberships.id })
          .from(batchMemberships)
          .innerJoin(batchSubjects, and(eq(batchSubjects.tenantId, batchMemberships.tenantId), eq(batchSubjects.batchId, batchMemberships.batchId)))
          .innerJoin(batchSubjectInstructors, and(eq(batchSubjectInstructors.tenantId, batchSubjects.tenantId), eq(batchSubjectInstructors.batchSubjectId, batchSubjects.id)))
          .innerJoin(instructors, and(eq(instructors.tenantId, batchSubjectInstructors.tenantId), eq(instructors.id, batchSubjectInstructors.instructorId)))
          .where(
            and(
              eq(batchMemberships.tenantId, students.tenantId),
              eq(batchMemberships.studentId, students.id),
              eq(batchMemberships.status, "ACTIVE"),
              eq(instructors.userId, viewer.userId),
            ),
          ),
      );
      const checks = [
        viewer.permissions.has("student.self.view") ? own : undefined,
        viewer.permissions.has("batches.own.view") ? and(eq(students.tenantId, viewer.tenantId), eq(students.photoFileId, file.id), taught) : undefined,
      ].filter((c) => c !== undefined);
      for (const where of checks) {
        const [hit] = await db.select({ id: students.id }).from(students).where(where);
        if (hit) return true;
      }
      return false;
    }
    case "INSTRUCTOR_PHOTO": {
      if (viewer.permissions.has("instructors.view")) return true;
      const [own] = await db
        .select({ id: instructors.id })
        .from(instructors)
        .where(and(eq(instructors.tenantId, viewer.tenantId), eq(instructors.userId, viewer.userId), eq(instructors.photoFileId, file.id)));
      return !!own;
    }
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
