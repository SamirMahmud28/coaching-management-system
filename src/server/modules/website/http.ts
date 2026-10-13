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
