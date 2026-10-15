import { APP_THEME_KEYS } from "@/lib/app-themes";
import { z } from "zod";
import type { Db } from "../../core/db/types";
import { handle, json, parseBody, pathId } from "../../core/http/respond";
import type { HostConfig } from "../../core/tenancy/host";
import type { TenantAuth } from "../auth/tenant-auth";
import { authenticateTenantRequest, withAuthorization } from "../authorization/service";
import * as settings from "./service";

export interface SettingsHttpDeps {
  db: Db;
  auth: TenantAuth;
  host: HostConfig;
}

const uuid = z.string().uuid();
const text = (max: number) => z.string().max(max).nullable().optional();

const profileBody = z.object({
  display_name: z.string().max(150),
  short_name: text(50),
  address: text(500),
  phone: text(30),
  email: text(254),
  website: text(200),
  institution_code: text(30),
  logo_file_id: uuid.nullable().optional(),
  primary_color: text(7),
  secondary_color: text(7),
});
const signatureBody = z.object({
  title: z.string().max(50),
  person_name: z.string().max(100),
  signature_file_id: uuid.nullable().optional(),
  sort_order: z.number().int().optional(),
});

const studentIdBody = z.object({
  prefix: z.string().max(10),
  include_course_code: z.boolean(),
  separator: z.enum(["-", "/", ""]),
  sequence_width: z.number().int(),
});

const appearanceBody = z.object({ app_theme: z.enum(APP_THEME_KEYS), paper_background: z.boolean().nullable().optional() });

export function createSettingsHandlers({ db, auth, host }: SettingsHttpDeps) {
  async function authorizeManage(request: Request) {
    const ctx = await withAuthorization({ db, auth, headers: request.headers, host, method: request.method, permission: "settings.manage" });
    return { tenantId: ctx.tenant.id, userId: ctx.userId! };
  }

  return {
    // GET /api/v1/settings/institution — any signed-in user of the school (branding shows everywhere)
    getProfile: (request: Request) =>
      handle(async () => {
        const ctx = await authenticateTenantRequest({ db, auth, headers: request.headers, host, method: request.method, module: "core" });
        return json(await settings.getInstitutionProfile(db, ctx.tenant.id));
      }),

    // PUT /api/v1/settings/institution
    saveProfile: (request: Request) =>
      handle(async () => {
        const actor = await authorizeManage(request);
        const b = await parseBody(request, profileBody);
        return json(
          await settings.saveInstitutionProfile(db, actor, {
            displayName: b.display_name,
            shortName: b.short_name ?? null,
            address: b.address ?? null,
            phone: b.phone ?? null,
            email: b.email ?? null,
            website: b.website ?? null,
            institutionCode: b.institution_code ?? null,
            logoFileId: b.logo_file_id ?? null,
            primaryColor: b.primary_color ?? null,
            secondaryColor: b.secondary_color ?? null,
          }),
        );
      }),

    // GET /api/v1/settings/appearance — the institute's app theme
    getAppearance: (request: Request) =>
      handle(async () => {
        const actor = await authorizeManage(request);
        return json(await settings.getAppearance(db, actor.tenantId));
      }),

    // PUT /api/v1/settings/appearance
    saveAppearance: (request: Request) =>
      handle(async () => {
        const actor = await authorizeManage(request);
        const b = await parseBody(request, appearanceBody);
        return json(
          await settings.setAppTheme(db, { tenantId: actor.tenantId, theme: b.app_theme, paper: b.paper_background, actor: { type: "TENANT_USER", userId: actor.userId } }),
        );
      }),

    // GET /api/v1/settings/signatures
    listSignatures: (request: Request) =>
      handle(async () => {
        const actor = await authorizeManage(request);
        return json({ items: await settings.listSignatures(db, actor.tenantId) });
      }),

    // GET /api/v1/settings/student-id — the pattern new student IDs follow
    getStudentIdPattern: (request: Request) =>
      handle(async () => {
        const actor = await authorizeManage(request);
        return json(await settings.getStudentIdPattern(db, actor.tenantId));
      }),

    // PUT /api/v1/settings/student-id
    saveStudentIdPattern: (request: Request) =>
      handle(async () => {
        const actor = await authorizeManage(request);
        const b = await parseBody(request, studentIdBody);
        return json(
          await settings.saveStudentIdPattern(db, actor, {
            prefix: b.prefix,
            includeCourseCode: b.include_course_code,
            separator: b.separator,
            sequenceWidth: b.sequence_width,
          }),
        );
      }),

    // POST /api/v1/settings/signatures
    createSignature: (request: Request) =>
      handle(async () => {
        const actor = await authorizeManage(request);
        const b = await parseBody(request, signatureBody);
        return json(
          await settings.createSignature(db, actor, { title: b.title, personName: b.person_name, signatureFileId: b.signature_file_id, sortOrder: b.sort_order }),
          201,
        );
      }),

    // PATCH /api/v1/settings/signatures/:id
    updateSignature: (request: Request, params: { id: string }) =>
      handle(async () => {
        const actor = await authorizeManage(request);
        const b = await parseBody(request, signatureBody.partial());
        return json(
          await settings.updateSignature(db, actor, pathId(params.id, "SIGNATURE"), {
            title: b.title,
            personName: b.person_name,
            signatureFileId: b.signature_file_id,
            sortOrder: b.sort_order,
          }),
        );
      }),

    // DELETE /api/v1/settings/signatures/:id
    deleteSignature: (request: Request, params: { id: string }) =>
      handle(async () => {
        const actor = await authorizeManage(request);
        await settings.deleteSignature(db, actor, pathId(params.id, "SIGNATURE"));
        return new Response(null, { status: 204 });
      }),
  };
}
