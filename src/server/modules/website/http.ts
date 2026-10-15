import { z } from "zod";
import { WEBSITE_SECTIONS } from "../../core/db/schema";
import type { Db } from "../../core/db/types";
import { NotFoundError } from "../../core/errors";
import { getFileInTenant, readFileBytes } from "../../core/files/service";
import type { StorageProvider } from "../../core/files/storage";
import { handle, json, parseBody, parseQuery, pathId } from "../../core/http/respond";
import type { PermissionName } from "../../core/rbac/catalog";
import type { HostConfig } from "../../core/tenancy/host";
import { resolveHost } from "../../core/tenancy/resolve";
import type { TenantAuth } from "../auth/tenant-auth";
import { withAuthorization } from "../authorization/service";
import { publicPageVisible } from "../portal/service";
import { getInstitutionProfile } from "../settings/service";
import { isModuleActive } from "../entitlements/service";
import * as content from "./content";
import * as enquiries from "./enquiries";
import { isPublicWebsiteImage } from "./public";
import { toCamelCaseKeys } from "../../core/http/case";
import {
  APPEARANCES, BACKGROUNDS, BODY_FONTS, BUTTON_STYLES, CARD_STYLES, COURSE_LAYOUTS, DENSITIES, FAQ_LAYOUTS, GALLERY_LAYOUTS, MOTION_LEVELS, GRADIENT_CHOICES, HEADER_STYLES, HERO_LAYOUTS,
  HERO_OVERLAYS, NOTICE_LAYOUTS, PALETTE_CHOICES, RADII, SITE_LANGUAGES, TESTIMONIAL_LAYOUTS, TEXT_SIZES, type WebsiteDesign,
} from "./design";
import { FEATURE_ICONS, SOCIAL_NETWORKS, type WebsiteContent } from "./site-content";
import * as showcase from "./showcase";
import { HERO_BUTTONS, WEBSITE_FONTS, WEBSITE_THEMES, getWebsiteSettings, saveWebsiteSettings } from "./settings";

export interface WebsiteHttpDeps {
  db: Db;
  auth: TenantAuth;
  host: HostConfig;
  storage: StorageProvider;
}

const optionalText = (max: number) => z.string().max(max).nullable().optional();
const colour = z.string().max(20).nullable().optional();
const designBody = z.object({
  palette: z.enum(PALETTE_CHOICES),
  custom_primary: colour,
  custom_accent: colour,
  gradient: z.enum(GRADIENT_CHOICES),
  body_font: z.enum(BODY_FONTS),
  text_size: z.enum(TEXT_SIZES),
  radius: z.enum(RADII),
  button_style: z.enum(BUTTON_STYLES),
  card_style: z.enum(CARD_STYLES),
  density: z.enum(DENSITIES),
  background: z.enum(BACKGROUNDS),
  appearance: z.enum(APPEARANCES),
  header_style: z.enum(HEADER_STYLES),
  hero_layout: z.enum(HERO_LAYOUTS),
  hero_overlay: z.enum(HERO_OVERLAYS),
  gallery_layout: z.enum(GALLERY_LAYOUTS),
  testimonial_layout: z.enum(TESTIMONIAL_LAYOUTS),
  course_layout: z.enum(COURSE_LAYOUTS),
  notice_layout: z.enum(NOTICE_LAYOUTS),
  faq_layout: z.enum(FAQ_LAYOUTS),
  motion: z.enum(MOTION_LEVELS),
  language: z.enum(SITE_LANGUAGES),
});
const contentBody = z.object({
  section_titles: z.partialRecord(z.enum(WEBSITE_SECTIONS), z.object({ title: optionalText(200), subtitle: optionalText(400) })),
  announcement: z.object({ text: z.string().max(400), link_url: optionalText(400), link_label: optionalText(80), show_until: optionalText(10) }).nullable(),
  social: z.object(Object.fromEntries(SOCIAL_NETWORKS.map((n) => [n, optionalText(400)])) as Record<(typeof SOCIAL_NETWORKS)[number], ReturnType<typeof optionalText>>),
  stats: z.array(z.object({ value: z.number(), suffix: optionalText(20), label: z.string().max(200) })).max(50).optional(),
  features: z.array(z.object({ icon: z.enum(FEATURE_ICONS), title: z.string().max(200), text: optionalText(600) })).max(50).optional(),
  faqs: z.array(z.object({ question: z.string().max(600), answer: z.string().max(3000) })).max(100).optional(),
  videos: z.array(z.object({ youtube_id: z.string().max(400), title: optionalText(300) })).max(50).optional(),
  hero_slides: z.array(z.object({ image_file_id: z.uuid(), heading: optionalText(400), subheading: optionalText(600) })).max(20).optional(),
  show_ticker: z.boolean().optional(),
});
const facultyBody = z.object({ instructor_id: z.uuid(), line: optionalText(240) });
const facultyLineBody = z.object({ line: optionalText(240) });
const achieverBody = z.object({ name: z.string().max(200), result: z.string().max(160), exam: optionalText(80), photo_file_id: z.uuid().nullable().optional() });
const settingsBody = z.object({
  theme: z.enum(WEBSITE_THEMES),
  heading_font: z.enum(WEBSITE_FONTS),
  design: designBody,
  content: contentBody,
  sections: z.array(z.object({ key: z.enum(WEBSITE_SECTIONS), enabled: z.boolean(), on_home: z.boolean() })).max(WEBSITE_SECTIONS.length),
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
const enquiryStatus = z.enum(["NEW", "CONTACTED", "CONVERTED", "CLOSED"]);
const enquiriesQuery = z.object({ status: enquiryStatus.optional() });
const enquiryUpdateBody = z.object({ status: enquiryStatus.optional(), note: optionalText(1000) });
const convertBody = z.object({ student_id: z.uuid() });
const submissionBody = z.object({
  name: z.string().max(300),
  mobile: z.string().max(40),
  course_id: z.uuid().nullable().optional(),
  message: optionalText(3000),
  website: z.string().max(300).nullable().optional(),
  started_at: z.number().int().nullable().optional(),
});

/** The visitor's address as the reverse proxy reports it (first X-Forwarded-For entry), for the per-IP limit only. */
const clientIp = (request: Request) => request.headers.get("x-forwarded-for")?.split(",")[0]?.trim().slice(0, 45) || request.headers.get("x-real-ip")?.trim().slice(0, 45) || null;

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

  /** Whether the request comes from a signed-in website editor of this institute (the live preview). */
  const canPreview = async (request: Request, tenantId: string) => {
    try {
      return (await authorize(request, "website.manage")).tenantId === tenantId;
    } catch {
      return false;
    }
  };

  return {
    // GET /api/v1/website/settings
    getSettings: (request: Request) =>
      handle(async () => {
        const actor = await authorize(request, "website.manage");
        return json(await withBrand(actor.tenantId, await getWebsiteSettings(db, actor.tenantId)));
      }),

    // PUT /api/v1/website/settings — public at once
    saveSettings: (request: Request) =>
      handle(async () => {
        const actor = await authorize(request, "website.manage");
        const b = await parseBody(request, settingsBody);
        const saved = await saveWebsiteSettings(db, actor, {
          theme: b.theme, headingFont: b.heading_font, sections: b.sections.map((s) => ({ key: s.key, enabled: s.enabled, onHome: s.on_home })), heroHeading: b.hero_heading ?? null, heroSubheading: b.hero_subheading ?? null,
          heroImageFileId: b.hero_image_file_id ?? null, heroButton: b.hero_button, aboutHeading: b.about_heading ?? null, aboutText: b.about_text ?? null,
          aboutImageFileId: b.about_image_file_id ?? null,
          design: toCamelCaseKeys<WebsiteDesign>({ ...b.design, custom_primary: b.design.custom_primary ?? null, custom_accent: b.design.custom_accent ?? null }),
          content: toCamelCaseKeys<WebsiteContent>(b.content),
        });
        return json(await withBrand(actor.tenantId, saved));
      }),

    // --- faculty and achievers -----------------------------------------------------------------------------

    // GET /api/v1/website/faculty — the instructors on the website, and those that can be added
    listFaculty: (request: Request) =>
      handle(async () => {
        const actor = await authorize(request, "website.manage");
        const [items, candidates] = await Promise.all([showcase.listFaculty(db, actor.tenantId), showcase.facultyCandidates(db, actor.tenantId)]);
        return json({ items, candidates, limit: showcase.MAX_FACULTY });
      }),

    // POST /api/v1/website/faculty
    addFaculty: (request: Request) =>
      handle(async () => {
        const actor = await authorize(request, "website.manage");
        const b = await parseBody(request, facultyBody);
        return json(await showcase.addFaculty(db, actor, { instructorId: b.instructor_id, line: b.line }), 201);
      }),

    // PATCH /api/v1/website/faculty/:id
    updateFaculty: (request: Request, params: { id: string }) =>
      handle(async () => {
        const actor = await authorize(request, "website.manage");
        const b = await parseBody(request, facultyLineBody);
        return json(await showcase.updateFaculty(db, actor, pathId(params.id, "FACULTY"), { line: b.line }));
      }),

    // DELETE /api/v1/website/faculty/:id — takes the instructor off the website only
    removeFaculty: (request: Request, params: { id: string }) =>
      handle(async () => {
        const actor = await authorize(request, "website.manage");
        await showcase.removeFaculty(db, actor, pathId(params.id, "FACULTY"));
        return noContent();
      }),

    // PUT /api/v1/website/faculty/order
    reorderFaculty: (request: Request) =>
      handle(async () => {
        const actor = await authorize(request, "website.manage");
        const b = await parseBody(request, orderBody);
        await showcase.reorderFaculty(db, actor, b.ids);
        return noContent();
      }),

    // GET /api/v1/website/achievers
    listAchievers: (request: Request) =>
      handle(async () => {
        const actor = await authorize(request, "website.manage");
        return json({ items: await showcase.listAchievers(db, actor.tenantId), limit: showcase.MAX_ACHIEVERS });
      }),

    // POST /api/v1/website/achievers
    createAchiever: (request: Request) =>
      handle(async () => {
        const actor = await authorize(request, "website.manage");
        const b = await parseBody(request, achieverBody);
        return json(await showcase.createAchiever(db, actor, { name: b.name, result: b.result, exam: b.exam, photoFileId: b.photo_file_id }), 201);
      }),

    // PATCH /api/v1/website/achievers/:id
    updateAchiever: (request: Request, params: { id: string }) =>
      handle(async () => {
        const actor = await authorize(request, "website.manage");
        const b = await parseBody(request, achieverBody);
        return json(await showcase.updateAchiever(db, actor, pathId(params.id, "ACHIEVER"), { name: b.name, result: b.result, exam: b.exam, photoFileId: b.photo_file_id }));
      }),

    // DELETE /api/v1/website/achievers/:id
    removeAchiever: (request: Request, params: { id: string }) =>
      handle(async () => {
        const actor = await authorize(request, "website.manage");
        await showcase.removeAchiever(db, actor, pathId(params.id, "ACHIEVER"));
        return noContent();
      }),

    // PUT /api/v1/website/achievers/order
    reorderAchievers: (request: Request) =>
      handle(async () => {
        const actor = await authorize(request, "website.manage");
        const b = await parseBody(request, orderBody);
        await showcase.reorderAchievers(db, actor, b.ids);
        return noContent();
      }),

    // --- notices ---------------------------------------------------------------------------------------

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

    // --- gallery ---------------------------------------------------------------------------------------

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

    // --- testimonials ----------------------------------------------------------------------------------

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

    // --- enquiries ---------------------------------------------------------------------------------

    // GET /api/v1/website/enquiries?status=
    listEnquiries: (request: Request) =>
      handle(async () => {
        const actor = await authorize(request, "website.manage");
        return json(await enquiries.listEnquiries(db, actor.tenantId, parseQuery(request, enquiriesQuery)));
      }),

    // GET /api/v1/website/enquiries/:id — also what admission pre-fills from
    getEnquiry: (request: Request, params: { id: string }) =>
      handle(async () => {
        const actor = await authorize(request, "website.manage");
        return json(await enquiries.getEnquiry(db, actor.tenantId, pathId(params.id, "ENQUIRY")));
      }),

    // PATCH /api/v1/website/enquiries/:id — status and note
    updateEnquiry: (request: Request, params: { id: string }) =>
      handle(async () => {
        const actor = await authorize(request, "website.manage");
        const b = await parseBody(request, enquiryUpdateBody);
        return json(await enquiries.updateEnquiry(db, actor, pathId(params.id, "ENQUIRY"), { status: b.status, note: b.note }));
      }),

    // POST /api/v1/website/enquiries/:id/convert — links the student admission just created
    convertEnquiry: (request: Request, params: { id: string }) =>
      handle(async () => {
        const actor = await authorize(request, "website.manage");
        const b = await parseBody(request, convertBody);
        return json(await enquiries.convertEnquiry(db, actor, pathId(params.id, "ENQUIRY"), b.student_id));
      }),

    // POST /api/public/enquiries — the website's admission enquiry form (no sign-in; spam-checked and rate-limited)
    submitEnquiry: (request: Request) =>
      handle(async () => {
        const resolved = await resolveHost(db, request.headers.get("host"), host);
        if (resolved.kind !== "tenant" || !publicPageVisible(resolved.tenant.status)) throw new NotFoundError("resource");
        if (!(await isModuleActive(db, resolved.tenant.id, "website"))) throw new NotFoundError("resource");
        const b = await parseBody(request, submissionBody);
        await enquiries.submitEnquiry(
          db,
          resolved.tenant.id,
          { name: b.name, mobile: b.mobile, courseId: b.course_id, message: b.message, website: b.website, startedAt: b.started_at },
          { ipAddress: clientIp(request) },
        );
        // The same answer whether stored or dropped as spam, so bots learn nothing.
        return json({ ok: true }, 201);
      }),

    // GET /api/public/website-images/:id — a picture the website uses, for this host's institute, while the website is shown
    publicImage: (request: Request, params: { id: string }) =>
      handle(async () => {
        const resolved = await resolveHost(db, request.headers.get("host"), host);
        if (resolved.kind !== "tenant" || !publicPageVisible(resolved.tenant.status)) throw new NotFoundError("FILE");
        const tenantId = resolved.tenant.id;
        const id = pathId(params.id, "FILE");
        if (!(await isModuleActive(db, tenantId, "website"))) throw new NotFoundError("FILE");
        // A picture not yet on the website is shown only to the institute's own website editors, for the live preview
        //, and never cached; everyone else gets 404, as before.
        const inUse = await isPublicWebsiteImage(db, tenantId, id);
        const preview = !inUse && (await canPreview(request, tenantId));
        const row = inUse || preview ? await getFileInTenant(db, tenantId, id) : null;
        if (!row || (preview && row.category !== "WEBSITE_IMAGE" && row.category !== "INSTRUCTOR_PHOTO")) throw new NotFoundError("FILE");
        const bytes = await readFileBytes(storage, row);
        return new Response(new Uint8Array(bytes), {
          headers: {
            "content-type": row.mimeType,
            "content-length": String(bytes.length),
            // A file's bytes never change (a new upload is a new id); an hour keeps removals reasonably prompt.
            "cache-control": preview ? "private, no-store" : "public, max-age=3600",
            "x-content-type-options": "nosniff",
          },
        });
      }),
  };
}
