import { z } from "zod";
import { WEBSITE_SECTIONS } from "../../core/db/schema";
import type { Db } from "../../core/db/types";
import { NotFoundError } from "../../core/errors";
import { getFileInTenant, readFileBytes } from "../../core/files/service";
import type { StorageProvider } from "../../core/files/storage";
import { handle, json, parseBody, pathId } from "../../core/http/respond";
import type { PermissionName } from "../../core/rbac/catalog";
import type { HostConfig } from "../../core/tenancy/host";
import { resolveHost } from "../../core/tenancy/resolve";
import type { TenantAuth } from "../auth/tenant-auth";
import { withAuthorization } from "../authorization/service";
import { publicPageVisible } from "../portal/service";
import { getInstitutionProfile } from "../settings/service";
import { isModuleActive } from "../entitlements/service";
import * as content from "./content";
import { isPublicWebsiteImage } from "./public";
import { HERO_BUTTONS, WEBSITE_FONTS, WEBSITE_THEMES, getWebsiteSettings, saveWebsiteSettings } from "./settings";

export interface WebsiteHttpDeps {
  db: Db;
  auth: TenantAuth;
  host: HostConfig;
  storage: StorageProvider;
}

const optionalText = (max: number) => z.string().max(max).nullable().optional();
const settingsBody = z.object({
  theme: z.enum(WEBSITE_THEMES),
  heading_font: z.enum(WEBSITE_FONTS),
  sections: z.array(z.object({ key: z.enum(WEBSITE_SECTIONS), enabled: z.boolean() })).max(WEBSITE_SECTIONS.length),
  hero_heading: optionalText(200),
  hero_subheading: optionalText(400),
  hero_image_file_id: z.uuid().nullable().optional(),
  hero_button: z.enum(HERO_BUTTONS),
  about_heading: optionalText(200),
  about_text: optionalText(5000),
  about_image_file_id: z.uuid().nullable().optional(),
});

const date = z.string().max(10);
const noticeBody = z.object({
  title: z.string().max(300),
  body: z.string().max(10000),
  notice_date: date.nullable().optional(),
  pinned: z.boolean().optional(),
  show_until: date.nullable().optional(),
});
const photoBody = z.object({ file_id: z.uuid(), caption: optionalText(400) });
const captionBody = z.object({ caption: optionalText(400) });
const testimonialBody = z.object({ quote: z.string().max(1200), name: z.string().max(200), line: optionalText(240), photo_file_id: z.uuid().nullable().optional() });
const orderBody = z.object({ ids: z.array(z.uuid()).max(200) });

export function createWebsiteHandlers({ db, auth, host, storage }: WebsiteHttpDeps) {
  const authorize = async (request: Request, permission: PermissionName) => {
    const ctx = await withAuthorization({ db, auth, headers: request.headers, host, method: request.method, permission });
    return { tenantId: ctx.tenant.id, userId: ctx.userId, permissions: ctx.permissions };
  };

  /** What the editor shows beside the settings: the brand colour and contact details come from Institute Settings. */
  const withBrand = async <T extends object>(tenantId: string, settings: T) => {
    const profile = await getInstitutionProfile(db, tenantId);
    return { ...settings, brand: { primaryColor: profile.primaryColor, phone: profile.phone, address: profile.address } };
  };

  const noContent = () => new Response(null, { status: 204 });

  return {
    // GET /api/v1/website/settings
    getSettings: (request: Request) =>
      handle(async () => {
        const actor = await authorize(request, "website.manage");
        return json(await withBrand(actor.tenantId, await getWebsiteSettings(db, actor.tenantId)));
      }),

    // PUT /api/v1/website/settings — public at once (D126)
    saveSettings: (request: Request) =>
      handle(async () => {
        const actor = await authorize(request, "website.manage");
        const b = await parseBody(request, settingsBody);
        const saved = await saveWebsiteSettings(db, actor, {
          theme: b.theme, headingFont: b.heading_font, sections: b.sections, heroHeading: b.hero_heading ?? null, heroSubheading: b.hero_subheading ?? null,
          heroImageFileId: b.hero_image_file_id ?? null, heroButton: b.hero_button, aboutHeading: b.about_heading ?? null, aboutText: b.about_text ?? null,
          aboutImageFileId: b.about_image_file_id ?? null,
        });
        return json(await withBrand(actor.tenantId, saved));
      }),

    // --- notices (D128) ---------------------------------------------------------------------------------------

    // GET /api/v1/website/notices — every notice with its status today
    listNotices: (request: Request) =>
      handle(async () => {
        const actor = await authorize(request, "website.manage");
        return json({ items: await content.listNotices(db, actor.tenantId) });
      }),

    // POST /api/v1/website/notices
    createNotice: (request: Request) =>
      handle(async () => {
        const actor = await authorize(request, "website.manage");
        const b = await parseBody(request, noticeBody);
        return json(await content.createNotice(db, actor, { title: b.title, body: b.body, noticeDate: b.notice_date, pinned: b.pinned, showUntil: b.show_until }), 201);
      }),

    // PATCH /api/v1/website/notices/:id
    updateNotice: (request: Request, params: { id: string }) =>
      handle(async () => {
        const actor = await authorize(request, "website.manage");
        const b = await parseBody(request, noticeBody);
        return json(await content.updateNotice(db, actor, pathId(params.id, "NOTICE"), { title: b.title, body: b.body, noticeDate: b.notice_date, pinned: b.pinned, showUntil: b.show_until }));
      }),

    // POST /api/v1/website/notices/:id/hide
    hideNotice: (request: Request, params: { id: string }) =>
      handle(async () => {
        const actor = await authorize(request, "website.manage");
        return json(await content.setNoticeHidden(db, actor, pathId(params.id, "NOTICE"), true));
      }),

    // POST /api/v1/website/notices/:id/show
    showNotice: (request: Request, params: { id: string }) =>
      handle(async () => {
        const actor = await authorize(request, "website.manage");
        return json(await content.setNoticeHidden(db, actor, pathId(params.id, "NOTICE"), false));
      }),

    // --- gallery (D125) ---------------------------------------------------------------------------------------

    // GET /api/v1/website/gallery
    listGallery: (request: Request) =>
      handle(async () => {
        const actor = await authorize(request, "website.manage");
        return json({ items: await content.listGallery(db, actor.tenantId), limit: content.MAX_GALLERY_PHOTOS });
      }),

    // POST /api/v1/website/gallery — an uploaded WEBSITE_IMAGE file, added at the end
    addGalleryPhoto: (request: Request) =>
      handle(async () => {
        const actor = await authorize(request, "website.manage");
        const b = await parseBody(request, photoBody);
        return json(await content.addGalleryPhoto(db, actor, { fileId: b.file_id, caption: b.caption }), 201);
      }),

    // PATCH /api/v1/website/gallery/:id — the caption
    updateGalleryPhoto: (request: Request, params: { id: string }) =>
      handle(async () => {
        const actor = await authorize(request, "website.manage");
        const b = await parseBody(request, captionBody);
        return json(await content.updateGalleryCaption(db, actor, pathId(params.id, "GALLERY_PHOTO"), b.caption));
      }),

    // DELETE /api/v1/website/gallery/:id
    removeGalleryPhoto: (request: Request, params: { id: string }) =>
      handle(async () => {
        const actor = await authorize(request, "website.manage");
        await content.removeGalleryPhoto(db, actor, pathId(params.id, "GALLERY_PHOTO"));
        return noContent();
      }),

    // PUT /api/v1/website/gallery/order
    reorderGallery: (request: Request) =>
      handle(async () => {
        const actor = await authorize(request, "website.manage");
        await content.reorderGallery(db, actor, (await parseBody(request, orderBody)).ids);
        return noContent();
      }),

    // --- testimonials (D130) ----------------------------------------------------------------------------------

    // GET /api/v1/website/testimonials
    listTestimonials: (request: Request) =>
      handle(async () => {
        const actor = await authorize(request, "website.manage");
        return json({ items: await content.listTestimonials(db, actor.tenantId) });
      }),

    // POST /api/v1/website/testimonials
    createTestimonial: (request: Request) =>
      handle(async () => {
        const actor = await authorize(request, "website.manage");
        const b = await parseBody(request, testimonialBody);
        return json(await content.createTestimonial(db, actor, { quote: b.quote, name: b.name, line: b.line, photoFileId: b.photo_file_id }), 201);
      }),

    // PATCH /api/v1/website/testimonials/:id
    updateTestimonial: (request: Request, params: { id: string }) =>
      handle(async () => {
        const actor = await authorize(request, "website.manage");
        const b = await parseBody(request, testimonialBody);
        return json(await content.updateTestimonial(db, actor, pathId(params.id, "TESTIMONIAL"), { quote: b.quote, name: b.name, line: b.line, photoFileId: b.photo_file_id }));
      }),

    // DELETE /api/v1/website/testimonials/:id
    removeTestimonial: (request: Request, params: { id: string }) =>
      handle(async () => {
        const actor = await authorize(request, "website.manage");
        await content.removeTestimonial(db, actor, pathId(params.id, "TESTIMONIAL"));
        return noContent();
      }),

    // PUT /api/v1/website/testimonials/order
    reorderTestimonials: (request: Request) =>
      handle(async () => {
        const actor = await authorize(request, "website.manage");
        await content.reorderTestimonials(db, actor, (await parseBody(request, orderBody)).ids);
        return noContent();
      }),

    // GET /api/public/website-images/:id — a picture the website uses, for this host's institute, while the website is shown
    publicImage: (request: Request, params: { id: string }) =>
      handle(async () => {
        const resolved = await resolveHost(db, request.headers.get("host"), host);
        if (resolved.kind !== "tenant" || !publicPageVisible(resolved.tenant.status)) throw new NotFoundError("FILE");
        const tenantId = resolved.tenant.id;
        const id = pathId(params.id, "FILE");
        if (!(await isModuleActive(db, tenantId, "website")) || !(await isPublicWebsiteImage(db, tenantId, id))) throw new NotFoundError("FILE");
        const row = await getFileInTenant(db, tenantId, id);
        const bytes = await readFileBytes(storage, row);
        return new Response(new Uint8Array(bytes), {
          headers: {
            "content-type": row.mimeType,
            "content-length": String(bytes.length),
            // A file's bytes never change (a new upload is a new id); an hour keeps removals reasonably prompt.
            "cache-control": "public, max-age=3600",
            "x-content-type-options": "nosniff",
          },
        });
      }),
  };
}
