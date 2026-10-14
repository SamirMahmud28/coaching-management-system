import { and, asc, eq, or, sql } from "drizzle-orm";
import { courses, files, galleryPhotos, instructors, testimonials, websiteAchievers, websiteFaculty, websiteSettings } from "../../core/db/schema";
import type { DbOrTx } from "../../core/db/types";
import { isModuleActive } from "../entitlements/service";
import { getPublicCatalog } from "../portal/service";
import { listGallery, listTestimonials, publicNotices } from "./content";
import { todayInDhaka } from "../../../lib/dates";
import { getWebsiteSettings } from "./settings";
import { listAchievers, publicFaculty } from "./showcase";

// What visitors see at `<sub>.<domain>/` while the Website module is on (D21, D124–D133). Callers check the institute's
// public-page visibility (D58) first, exactly as for the Core page.

export type PublicWebsite = NonNullable<Awaited<ReturnType<typeof getPublicWebsite>>>;

/** The institute's themed website, or null while the Website module is off (the Core page is shown instead, D21). */
export async function getPublicWebsite(db: DbOrTx, tenantId: string) {
  if (!(await isModuleActive(db, tenantId, "website"))) return null;
  const [settings, catalog, notices, gallery, testimonialRows, courseOptions, faculty, achievers] = await Promise.all([
    getWebsiteSettings(db, tenantId),
    getPublicCatalog(db, tenantId),
    publicNotices(db, tenantId),
    listGallery(db, tenantId),
    listTestimonials(db, tenantId),
    db.select({ id: courses.id, name: courses.name }).from(courses).where(and(eq(courses.tenantId, tenantId), eq(courses.status, "ACTIVE"))).orderBy(asc(courses.name)),
    publicFaculty(db, tenantId),
    listAchievers(db, tenantId),
  ]);
  return {
    settings: {
      theme: settings.theme,
      headingFont: settings.headingFont,
      design: settings.design,
      /** The announcement is left out after its last day (D138). */
      content: { ...settings.content, announcement: settings.content.announcement && (!settings.content.announcement.showUntil || settings.content.announcement.showUntil >= todayInDhaka()) ? settings.content.announcement : null },
      sections: settings.sections,
      heroHeading: settings.heroHeading,
      heroSubheading: settings.heroSubheading,
      heroImageFileId: settings.heroImageFileId,
      heroButton: settings.heroButton,
      aboutHeading: settings.aboutHeading,
      aboutText: settings.aboutText,
      aboutImageFileId: settings.aboutImageFileId,
    },
    profile: catalog.profile,
    courses: catalog.courses,
    notices,
    gallery: gallery.map((p) => ({ id: p.id, fileId: p.fileId, caption: p.caption })),
    /** The enquiry form's course choices (D129). */
    courseOptions,
    testimonials: testimonialRows.map((t) => ({ id: t.id, quote: t.quote, name: t.name, line: t.line, photoFileId: t.photoFileId })),
    /** Instructors the office shows (D141): name, photo, subjects and line only. */
    faculty,
    achievers: achievers.map((a) => ({ id: a.id, name: a.name, result: a.result, exam: a.exam, photoFileId: a.photoFileId })),
  };
}

/**
 * Whether a file may be served publicly for this institute's website: a website picture that the website actually uses
 * (hero, about, gallery or a testimonial). Anything else, including other uploads, stays private.
 */
export async function isPublicWebsiteImage(db: DbOrTx, tenantId: string, fileId: string): Promise<boolean> {
  const [file] = await db.select({ category: files.category }).from(files).where(and(eq(files.tenantId, tenantId), eq(files.id, fileId)));
  // An instructor's photo is public only while they are shown on the website and active (D141).
  if (file?.category === "INSTRUCTOR_PHOTO") {
    const [shown] = await db
      .select({ id: websiteFaculty.id })
      .from(websiteFaculty)
      .innerJoin(instructors, and(eq(instructors.tenantId, websiteFaculty.tenantId), eq(instructors.id, websiteFaculty.instructorId)))
      .where(and(eq(websiteFaculty.tenantId, tenantId), eq(instructors.photoFileId, fileId), eq(instructors.status, "ACTIVE")))
      .limit(1);
    return !!shown;
  }
  if (file?.category !== "WEBSITE_IMAGE") return false;
  const [inSettings] = await db
    .select({ id: websiteSettings.tenantId })
    .from(websiteSettings)
    .where(and(eq(websiteSettings.tenantId, tenantId), or(eq(websiteSettings.heroImageFileId, fileId), eq(websiteSettings.aboutImageFileId, fileId))));
  if (inSettings) return true;
  // A banner slide's picture (D147).
  const [inSlides] = await db
    .select({ id: websiteSettings.tenantId })
    .from(websiteSettings)
    .where(and(eq(websiteSettings.tenantId, tenantId), sql`${websiteSettings.content} -> 'heroSlides' @> ${JSON.stringify([{ imageFileId: fileId }])}::jsonb`));
  if (inSlides) return true;
  const [inGallery] = await db.select({ id: galleryPhotos.id }).from(galleryPhotos).where(and(eq(galleryPhotos.tenantId, tenantId), eq(galleryPhotos.fileId, fileId))).limit(1);
  if (inGallery) return true;
  const [inTestimonial] = await db.select({ id: testimonials.id }).from(testimonials).where(and(eq(testimonials.tenantId, tenantId), eq(testimonials.photoFileId, fileId))).limit(1);
  if (inTestimonial) return true;
  const [inAchievers] = await db.select({ id: websiteAchievers.id }).from(websiteAchievers).where(and(eq(websiteAchievers.tenantId, tenantId), eq(websiteAchievers.photoFileId, fileId))).limit(1);
  return !!inAchievers;
}
