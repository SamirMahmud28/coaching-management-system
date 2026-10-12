import { z } from "zod";
import { fileCategoryEnum } from "../../core/db/schema";
import type { Db } from "../../core/db/types";
import { ForbiddenError, NotFoundError, ValidationError } from "../../core/errors";
import { FILE_RULES, canUpload, canViewFile, getFileInTenant, readFileBytes, uploadFile } from "../../core/files/service";
import type { StorageProvider } from "../../core/files/storage";
import { handle, json, pathId } from "../../core/http/respond";
import type { HostConfig } from "../../core/tenancy/host";
import type { TenantAuth } from "../auth/tenant-auth";
import { resolveHost } from "../../core/tenancy/resolve";
import { authenticateTenantRequest } from "../authorization/service";
import { publicPageVisible } from "../portal/service";
import { getInstitutionProfile } from "../settings/service";

export interface FilesHttpDeps {
  db: Db;
  auth: TenantAuth;
  host: HostConfig;
  storage: StorageProvider;
}

const categorySchema = z.enum(fileCategoryEnum.enumValues);
// Multipart overhead on top of the largest allowed file; anything bigger is refused before it's read.
const MAX_REQUEST_BYTES = Math.max(...Object.values(FILE_RULES).map((r) => r.maxBytes)) + 64 * 1024;

export function createFilesHandlers({ db, auth, host, storage }: FilesHttpDeps) {
  return {
    // POST /api/v1/files — multipart form: `file`, `category`
    upload: (request: Request) =>
      handle(async () => {
        const ctx = await authenticateTenantRequest({ db, auth, headers: request.headers, host, method: request.method, module: "core" });
        const declared = Number(request.headers.get("content-length") ?? "0");
        if (declared > MAX_REQUEST_BYTES) throw new ValidationError("VALIDATION_FILE_TOO_LARGE", "The file is too large. The limit is 2 MB.", { field: "file" });

        let form: FormData;
        try {
          form = await request.formData();
        } catch {
          throw new ValidationError("VALIDATION_REQUEST", "Send the file as a multipart form with `file` and `category`.");
        }
        const category = categorySchema.safeParse(form.get("category"));
        if (!category.success) throw new ValidationError("VALIDATION_FILE_CATEGORY", "Unknown file category.", { field: "category" });
        if (!canUpload(category.data, ctx.permissions)) throw new ForbiddenError();
        const file = form.get("file");
        if (!(file instanceof File)) throw new ValidationError("VALIDATION_FILE_REQUIRED", "Choose a file to upload.", { field: "file" });

        const row = await uploadFile(db, storage, { tenantId: ctx.tenant.id, userId: ctx.userId }, {
          category: category.data,
          filename: file.name,
          bytes: Buffer.from(await file.arrayBuffer()),
        });
        return json({ id: row.id, category: row.category, filename: row.filename, mimeType: row.mimeType, size: row.size }, 201);
      }),

    // GET /api/v1/files/:id — the bytes, for a signed-in user of the same school who may see this file
    serve: (request: Request, params: { id: string }) =>
      handle(async () => {
        const ctx = await authenticateTenantRequest({ db, auth, headers: request.headers, host, method: request.method, module: "core" });
        const row = await getFileInTenant(db, ctx.tenant.id, pathId(params.id, "FILE"));
        // Not-allowed looks like not-found, so file ids can't be probed.
        if (!(await canViewFile(db, { tenantId: ctx.tenant.id, userId: ctx.userId, permissions: ctx.permissions }, row))) throw new NotFoundError("FILE");
        const bytes = await readFileBytes(storage, row);
        return new Response(new Uint8Array(bytes), {
          headers: {
            "content-type": row.mimeType,
            "content-length": String(bytes.length),
            // A file's bytes never change (a new upload is a new id), so the browser may keep it — privately.
            "cache-control": "private, max-age=86400, immutable",
            "content-disposition": `inline; filename*=UTF-8''${encodeURIComponent(row.filename)}`,
            "x-content-type-options": "nosniff",
          },
        });
      }),

    // GET /api/public/logo — this host's institute logo for its public page (D58: only while the page is shown)
    publicLogo: (request: Request) =>
      handle(async () => {
        const resolved = await resolveHost(db, request.headers.get("host"), host);
        if (resolved.kind !== "tenant" || !publicPageVisible(resolved.tenant.status)) throw new NotFoundError("FILE");
        const { logoFileId } = await getInstitutionProfile(db, resolved.tenant.id);
        if (!logoFileId) throw new NotFoundError("FILE");
        const row = await getFileInTenant(db, resolved.tenant.id, logoFileId);
        if (row.category !== "LOGO") throw new NotFoundError("FILE");
        const bytes = await readFileBytes(storage, row);
        return new Response(new Uint8Array(bytes), {
          headers: {
            "content-type": row.mimeType,
            "content-length": String(bytes.length),
            // The address stays the same when the logo changes, so keep it short.
            "cache-control": "public, max-age=300",
            "x-content-type-options": "nosniff",
          },
        });
      }),
  };
}
