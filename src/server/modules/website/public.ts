import { and, eq, or } from "drizzle-orm";
import { files, galleryPhotos, testimonials, websiteSettings } from "../../core/db/schema";
import type { DbOrTx } from "../../core/db/types";
import { isModuleActive } from "../entitlements/service";
import { getPublicCatalog } from "../portal/service";
import { getWebsiteSettings } from "./settings";

// What visitors see at `<sub>.<domain>/` while the Website module is on (D21, D124–D133). Callers check the institute's
// public-page visibility (D58) first, exactly as for the Core page.

export type PublicWebsite = NonNullable<Awaited<ReturnType<typeof getPublicWebsite>>>;

/** The institute's themed website, or null while the Website module is off (the Core page is shown instead, D21). */
export async function getPublicWebsite(db: DbOrTx, tenantId: string) {
  if (!(await isModuleActive(db, tenantId, "website"))) return null;
  const [settings, catalog] = await Promise.all([getWebsiteSettings(db, tenantId), getPublicCatalog(db, tenantId)]);
  return {
    settings: {
      theme: settings.theme,
      headingFont: settings.headingFont,
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
  };
}

/**
 * Whether a file may be served publicly for this institute's website: a website picture that the website actually uses
 * (hero, about, gallery or a testimonial). Anything else, including other uploads, stays private.
 */
export async function isPublicWebsiteImage(db: DbOrTx, tenantId: string, fileId: string): Promise<boolean> {
  const [file] = await db.select({ category: files.category }).from(files).where(and(eq(files.tenantId, tenantId), eq(files.id, fileId)));
  if (file?.category !== "WEBSITE_IMAGE") return false;
  const [inSettings] = await db
    .select({ id: websiteSettings.tenantId })
    .from(websiteSettings)
    .where(and(eq(websiteSettings.tenantId, tenantId), or(eq(websiteSettings.heroImageFileId, fileId), eq(websiteSettings.aboutImageFileId, fileId))));
  if (inSettings) return true;
  const [inGallery] = await db.select({ id: galleryPhotos.id }).from(galleryPhotos).where(and(eq(galleryPhotos.tenantId, tenantId), eq(galleryPhotos.fileId, fileId))).limit(1);
  if (inGallery) return true;
  const [inTestimonial] = await db.select({ id: testimonials.id }).from(testimonials).where(and(eq(testimonials.tenantId, tenantId), eq(testimonials.photoFileId, fileId))).limit(1);
  return !!inTestimonial;
}
