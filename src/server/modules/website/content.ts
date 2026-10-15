import { and, asc, desc, eq, gte, isNull, lte, max, or, sql } from "drizzle-orm";
import { galleryPhotos, testimonials, websiteNotices } from "../../core/db/schema";
import { inTransaction } from "../../core/db/transaction";
import type { DbOrTx } from "../../core/db/types";
import { assertFileReference } from "../../core/files/service";
import { ConflictError, NotFoundError, ValidationError } from "../../core/errors";
import { isCalendarDate, todayInDhaka } from "@/lib/dates";
import type { Actor } from "./settings";

// The website's own lists: public notices, the gallery and testimonials. Every save is public at
// once. Notices are hidden rather than deleted; a gallery photo or testimonial is website content, so removing
// one deletes its row (the picture file stays in storage).

export const MAX_GALLERY_PHOTOS = 60;
/** How many notices the website shows at most: the pinned ones first, then the newest. */
export const PUBLIC_NOTICE_LIMIT = 10;

function text(value: string | null | undefined, max: number, field: string, label: string, required = false): string | null {
  const v = value?.trim() ?? "";
  if (required && !v) throw new ValidationError("VALIDATION_REQUIRED", `${label} is required.`, { field });
  if (v.length > max) throw new ValidationError("VALIDATION_TEXT", `${label} can be at most ${max} characters.`, { field });
  return v === "" ? null : v;
}

function cleanDate(value: string | null | undefined, field: string, label: string): string {
  const v = value?.trim() ?? "";
  if (!isCalendarDate(v)) throw new ValidationError("VALIDATION_DATE", `Enter ${label}.`, { field });
  return v;
}

/** Puts the listed rows in the given order: the list must name every row exactly once. */
function assertSameSet(ids: string[], existing: string[], field: string) {
  const same = ids.length === existing.length && new Set(ids).size === ids.length && ids.every((id) => existing.includes(id));
  if (!same) throw new ValidationError("VALIDATION_ORDER", "The list changed while you were ordering it. Reload and try again.", { field });
}

// ---------------------------------------------------------------------------
// Notices
// ---------------------------------------------------------------------------

export type NoticeStatus = "ON_WEBSITE" | "SCHEDULED" | "EXPIRED" | "HIDDEN";

export interface NoticeInput {
  title: string;
  body: string;
  noticeDate?: string | null;
  pinned?: boolean;
  showUntil?: string | null;
}

type NoticeRow = typeof websiteNotices.$inferSelect;

/** Where a notice stands today: shown from its date until "show until" (inclusive), unless hidden. */
export function noticeStatus(n: Pick<NoticeRow, "noticeDate" | "showUntil" | "hiddenAt">, today = todayInDhaka()): NoticeStatus {
  if (n.hiddenAt) return "HIDDEN";
  if (n.noticeDate > today) return "SCHEDULED";
  if (n.showUntil && n.showUntil < today) return "EXPIRED";
  return "ON_WEBSITE";
}

function cleanNotice(input: NoticeInput) {
  const noticeDate = input.noticeDate ? cleanDate(input.noticeDate, "noticeDate", "the notice date") : todayInDhaka();
  const showUntil = input.showUntil ? cleanDate(input.showUntil, "showUntil", "the last day to show it") : null;
  if (showUntil && showUntil < noticeDate) throw new ValidationError("VALIDATION_DATE_ORDER", "\"Show until\" can't be before the notice date.", { field: "showUntil" });
  return {
    title: text(input.title, 150, "title", "The title", true)!,
    body: text(input.body, 5000, "body", "The text", true)!,
    noticeDate,
    pinned: !!input.pinned,
    showUntil,
  };
}

const withStatus = (n: NoticeRow) => ({ ...n, status: noticeStatus(n) });

/** The office list: every notice, hidden ones too, pinned first and then the newest. */
export async function listNotices(db: DbOrTx, tenantId: string) {
  const rows = await db
    .select()
    .from(websiteNotices)
    .where(eq(websiteNotices.tenantId, tenantId))
    .orderBy(desc(websiteNotices.pinned), desc(websiteNotices.noticeDate), desc(websiteNotices.createdAt));
  return rows.map(withStatus);
}

async function getNotice(db: DbOrTx, tenantId: string, id: string) {
  const [row] = await db.select().from(websiteNotices).where(and(eq(websiteNotices.tenantId, tenantId), eq(websiteNotices.id, id)));
  if (!row) throw new NotFoundError("NOTICE");
  return row;
}

export async function createNotice(db: DbOrTx, actor: Actor, input: NoticeInput) {
  const values = cleanNotice(input);
  const [row] = await db.insert(websiteNotices).values({ tenantId: actor.tenantId, ...values, createdBy: actor.userId, updatedBy: actor.userId }).returning();
  return withStatus(row);
}

export async function updateNotice(db: DbOrTx, actor: Actor, id: string, input: NoticeInput) {
  await getNotice(db, actor.tenantId, id);
  const values = cleanNotice(input);
  const [row] = await db
    .update(websiteNotices)
    .set({ ...values, updatedBy: actor.userId, updatedAt: new Date() })
    .where(and(eq(websiteNotices.tenantId, actor.tenantId), eq(websiteNotices.id, id)))
    .returning();
  return withStatus(row);
}

/** Takes a notice off the website; it stays in the office list and can be shown again. */
export async function setNoticeHidden(db: DbOrTx, actor: Actor, id: string, hidden: boolean) {
  const row = await getNotice(db, actor.tenantId, id);
  if (!!row.hiddenAt === hidden) throw new ConflictError("CONFLICT_NOTICE_STATE", hidden ? "This notice is already hidden." : "This notice isn't hidden.");
  const [updated] = await db
    .update(websiteNotices)
    .set(hidden ? { hiddenAt: new Date(), hiddenBy: actor.userId } : { hiddenAt: null, hiddenBy: null })
    .where(and(eq(websiteNotices.tenantId, actor.tenantId), eq(websiteNotices.id, id)))
    .returning();
  return withStatus(updated);
}

/** What the website shows: notices on the website today, pinned first, then the newest, at most PUBLIC_NOTICE_LIMIT. */
export async function publicNotices(db: DbOrTx, tenantId: string, today = todayInDhaka()) {
  return db
    .select({ id: websiteNotices.id, title: websiteNotices.title, body: websiteNotices.body, noticeDate: websiteNotices.noticeDate, pinned: websiteNotices.pinned })
    .from(websiteNotices)
    .where(
      and(
        eq(websiteNotices.tenantId, tenantId),
        isNull(websiteNotices.hiddenAt),
        lte(websiteNotices.noticeDate, today),
        or(isNull(websiteNotices.showUntil), gte(websiteNotices.showUntil, today)),
      ),
    )
    .orderBy(desc(websiteNotices.pinned), desc(websiteNotices.noticeDate), desc(websiteNotices.createdAt))
    .limit(PUBLIC_NOTICE_LIMIT);
}

// ---------------------------------------------------------------------------
// Gallery
// ---------------------------------------------------------------------------

const lockGallery = (tx: DbOrTx, tenantId: string) => tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`gallery:${tenantId}`}))`);

export async function listGallery(db: DbOrTx, tenantId: string) {
  return db
    .select({ id: galleryPhotos.id, fileId: galleryPhotos.fileId, caption: galleryPhotos.caption, sortOrder: galleryPhotos.sortOrder })
    .from(galleryPhotos)
    .where(eq(galleryPhotos.tenantId, tenantId))
    .orderBy(asc(galleryPhotos.sortOrder), asc(galleryPhotos.createdAt));
}

/** Adds an uploaded website picture at the end of the gallery; at most MAX_GALLERY_PHOTOS. */
export async function addGalleryPhoto(db: DbOrTx, actor: Actor, input: { fileId: string; caption?: string | null }) {
  const caption = text(input.caption, 200, "caption", "The caption");
  return inTransaction(db, async (tx) => {
    await lockGallery(tx, actor.tenantId);
    await assertFileReference(tx, actor.tenantId, input.fileId, "WEBSITE_IMAGE", "fileId");
    const photos = await listGallery(tx, actor.tenantId);
    if (photos.length >= MAX_GALLERY_PHOTOS) {
      throw new ConflictError("CONFLICT_GALLERY_FULL", `The gallery holds at most ${MAX_GALLERY_PHOTOS} photos. Remove one to add another.`);
    }
    if (photos.some((p) => p.fileId === input.fileId)) throw new ConflictError("CONFLICT_GALLERY_DUPLICATE", "This photo is already in the gallery.");
    const next = (photos.at(-1)?.sortOrder ?? 0) + 1;
    const [row] = await tx.insert(galleryPhotos).values({ tenantId: actor.tenantId, fileId: input.fileId, caption, sortOrder: next, createdBy: actor.userId }).returning();
    return row;
  });
}

async function getPhoto(db: DbOrTx, tenantId: string, id: string) {
  const [row] = await db.select().from(galleryPhotos).where(and(eq(galleryPhotos.tenantId, tenantId), eq(galleryPhotos.id, id)));
  if (!row) throw new NotFoundError("GALLERY_PHOTO");
  return row;
}

export async function updateGalleryCaption(db: DbOrTx, actor: Actor, id: string, caption: string | null | undefined) {
  await getPhoto(db, actor.tenantId, id);
  const [row] = await db
    .update(galleryPhotos)
    .set({ caption: text(caption, 200, "caption", "The caption") })
    .where(and(eq(galleryPhotos.tenantId, actor.tenantId), eq(galleryPhotos.id, id)))
    .returning();
  return row;
}

export async function removeGalleryPhoto(db: DbOrTx, actor: Actor, id: string) {
  await getPhoto(db, actor.tenantId, id);
  await db.delete(galleryPhotos).where(and(eq(galleryPhotos.tenantId, actor.tenantId), eq(galleryPhotos.id, id)));
}

export async function reorderGallery(db: DbOrTx, actor: Actor, ids: string[]) {
  await inTransaction(db, async (tx) => {
    await lockGallery(tx, actor.tenantId);
    assertSameSet(ids, (await listGallery(tx, actor.tenantId)).map((p) => p.id), "photoIds");
    for (const [i, id] of ids.entries()) {
      await tx.update(galleryPhotos).set({ sortOrder: i + 1 }).where(and(eq(galleryPhotos.tenantId, actor.tenantId), eq(galleryPhotos.id, id)));
    }
  });
}

// ---------------------------------------------------------------------------
// Testimonials
// ---------------------------------------------------------------------------

export interface TestimonialInput {
  quote: string;
  name: string;
  line?: string | null;
  photoFileId?: string | null;
}

const lockTestimonials = (tx: DbOrTx, tenantId: string) => tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`testimonials:${tenantId}`}))`);

function cleanTestimonial(input: TestimonialInput) {
  return {
    quote: text(input.quote, 600, "quote", "The quote", true)!,
    name: text(input.name, 100, "name", "The name", true)!,
    line: text(input.line, 120, "line", "The line under the name"),
    photoFileId: input.photoFileId || null,
  };
}

export async function listTestimonials(db: DbOrTx, tenantId: string) {
  return db
    .select({ id: testimonials.id, quote: testimonials.quote, name: testimonials.name, line: testimonials.line, photoFileId: testimonials.photoFileId, sortOrder: testimonials.sortOrder })
    .from(testimonials)
    .where(eq(testimonials.tenantId, tenantId))
    .orderBy(asc(testimonials.sortOrder), asc(testimonials.createdAt));
}

async function getTestimonial(db: DbOrTx, tenantId: string, id: string) {
  const [row] = await db.select().from(testimonials).where(and(eq(testimonials.tenantId, tenantId), eq(testimonials.id, id)));
  if (!row) throw new NotFoundError("TESTIMONIAL");
  return row;
}

export async function createTestimonial(db: DbOrTx, actor: Actor, input: TestimonialInput) {
  const values = cleanTestimonial(input);
  return inTransaction(db, async (tx) => {
    await lockTestimonials(tx, actor.tenantId);
    if (values.photoFileId) await assertFileReference(tx, actor.tenantId, values.photoFileId, "WEBSITE_IMAGE", "photoFileId");
    const [{ last }] = await tx.select({ last: max(testimonials.sortOrder) }).from(testimonials).where(eq(testimonials.tenantId, actor.tenantId));
    const [row] = await tx.insert(testimonials).values({ tenantId: actor.tenantId, ...values, sortOrder: (last ?? 0) + 1, updatedBy: actor.userId }).returning();
    return row;
  });
}

export async function updateTestimonial(db: DbOrTx, actor: Actor, id: string, input: TestimonialInput) {
  const values = cleanTestimonial(input);
  return inTransaction(db, async (tx) => {
    await getTestimonial(tx, actor.tenantId, id);
    if (values.photoFileId) await assertFileReference(tx, actor.tenantId, values.photoFileId, "WEBSITE_IMAGE", "photoFileId");
    const [row] = await tx
      .update(testimonials)
      .set({ ...values, updatedBy: actor.userId, updatedAt: new Date() })
      .where(and(eq(testimonials.tenantId, actor.tenantId), eq(testimonials.id, id)))
      .returning();
    return row;
  });
}

export async function removeTestimonial(db: DbOrTx, actor: Actor, id: string) {
  await getTestimonial(db, actor.tenantId, id);
  await db.delete(testimonials).where(and(eq(testimonials.tenantId, actor.tenantId), eq(testimonials.id, id)));
}

export async function reorderTestimonials(db: DbOrTx, actor: Actor, ids: string[]) {
  await inTransaction(db, async (tx) => {
    await lockTestimonials(tx, actor.tenantId);
    assertSameSet(ids, (await listTestimonials(tx, actor.tenantId)).map((t) => t.id), "testimonialIds");
    for (const [i, id] of ids.entries()) {
      await tx.update(testimonials).set({ sortOrder: i + 1 }).where(and(eq(testimonials.tenantId, actor.tenantId), eq(testimonials.id, id)));
    }
  });
}
