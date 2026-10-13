import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "../../core/testing/db";
import { setModules } from "../../core/testing/modules";
import { auditLogs, galleryPhotos, tenants, testimonials, users, websiteSettings, type WebsiteSectionSetting } from "../../core/db/schema";
import type { Db } from "../../core/db/types";
import { seedPlatformCatalog } from "../../core/db/seed";
import { uploadFile, type FileCategory } from "../../core/files/service";
import { LocalDiskStorage } from "../../core/files/storage";
import { createTenantAuth } from "../auth/tenant-auth";
import { createWebsiteHandlers } from "./http";
import { getPublicWebsite, isPublicWebsiteImage } from "./public";
import { DEFAULT_SECTIONS, getWebsiteSettings, saveWebsiteSettings, type WebsiteSettingsInput } from "./settings";

const { db: testDb, reset, close } = createTestDb();
const db = testDb as unknown as Db;
const host = { baseDomain: "localhost:3000", platformHost: "admin.localhost:3000" };
const auth = createTenantAuth(db, { secret: "test-secret-".padEnd(40, "x"), host, protocol: "http" });
let storage: LocalDiskStorage;

beforeEach(async () => {
  await reset();
  await seedPlatformCatalog(testDb);
  storage = new LocalDiskStorage(await mkdtemp(path.join(os.tmpdir(), "cms-website-")));
});
afterAll(async () => {
  await close();
});

let counter = 0;
async function institute(status: "ACTIVE" | "SUSPENDED" | "DEACTIVATED" = "ACTIVE") {
  const subdomain = `site-${++counter}`;
  const [tenant] = await testDb.insert(tenants).values({ name: `Site ${counter}`, subdomain, status }).returning();
  const [user] = await testDb.insert(users).values({ tenantId: tenant.id, name: "Admin", username: `admin-${counter}` }).returning();
  const actor = { tenantId: tenant.id, userId: user.id };
  const upload = async (category: FileCategory = "WEBSITE_IMAGE") =>
    uploadFile(db, storage, actor, { category, filename: "x.jpg", bytes: await sharp({ create: { width: 2400, height: 1200, channels: 3, background: "#3366aa" } }).jpeg().toBuffer() });
  return { tenant, subdomain, actor, upload };
}

const input = (o: Partial<WebsiteSettingsInput> = {}): WebsiteSettingsInput => ({
  theme: "MODERN", headingFont: "POPPINS", sections: DEFAULT_SECTIONS, heroHeading: "Best coaching in town", heroSubheading: null,
  heroImageFileId: null, heroButton: "CALL", aboutHeading: null, aboutText: null, aboutImageFileId: null, ...o,
});

describe("website settings (D124, D126, D131)", () => {
  it("starts from the defaults, then saves the whole look at once and audits it", async () => {
    const s = await institute();
    expect(await getWebsiteSettings(db, s.tenant.id)).toMatchObject({ theme: "CLASSIC", headingFont: "INTER", heroButton: "ENQUIRE", isDefault: true, sections: DEFAULT_SECTIONS });

    const hero = await s.upload();
    const order: WebsiteSectionSetting[] = [...DEFAULT_SECTIONS].reverse().map((x) => ({ ...x, enabled: x.key !== "COURSES" }));
    const saved = await saveWebsiteSettings(db, s.actor, input({ heroImageFileId: hero.id, heroHeading: "  Best coaching in town  ", aboutText: "  ", sections: order }));
    expect(saved).toMatchObject({ theme: "MODERN", headingFont: "POPPINS", heroHeading: "Best coaching in town", aboutText: null, heroImageFileId: hero.id, isDefault: false });
    expect((await getWebsiteSettings(db, s.tenant.id)).sections).toEqual(order);

    await saveWebsiteSettings(db, s.actor, input({ theme: "BOLD" }));
    const audits = await testDb.select().from(auditLogs).where(eq(auditLogs.action, "WEBSITE_UPDATED"));
    expect(audits).toHaveLength(2);
    expect(audits.find((a) => (a.newValue as { theme: string }).theme === "BOLD")?.oldValue).toMatchObject({ theme: "MODERN" });
  });

  it.each([
    [{ sections: DEFAULT_SECTIONS.slice(1) }, "VALIDATION_WEBSITE_SECTIONS"],
    [{ sections: [...DEFAULT_SECTIONS.slice(1), DEFAULT_SECTIONS[1]] }, "VALIDATION_WEBSITE_SECTIONS"],
    [{ heroHeading: "x".repeat(121) }, "VALIDATION_TEXT"],
    [{ aboutText: "x".repeat(3001) }, "VALIDATION_TEXT"],
    [{ theme: "FANCY" as never }, "VALIDATION_CHOICE"],
  ])("refuses %o", async (o, code) => {
    const s = await institute();
    await expect(saveWebsiteSettings(db, s.actor, input(o))).rejects.toMatchObject({ code });
  });

  it("only takes website pictures of the same institute", async () => {
    const s = await institute();
    const other = await institute();
    const logo = await s.upload("LOGO");
    const foreign = await other.upload();
    await expect(saveWebsiteSettings(db, s.actor, input({ heroImageFileId: logo.id }))).rejects.toMatchObject({ code: "VALIDATION_FILE_REFERENCE" });
    await expect(saveWebsiteSettings(db, s.actor, input({ aboutImageFileId: foreign.id }))).rejects.toMatchObject({ code: "VALIDATION_FILE_REFERENCE" });
  });

  it("lists a section added to the product after the last save, switched on", async () => {
    const s = await institute();
    await saveWebsiteSettings(db, s.actor, input());
    await testDb.update(websiteSettings).set({ sections: DEFAULT_SECTIONS.filter((x) => x.key !== "GALLERY") }).where(eq(websiteSettings.tenantId, s.tenant.id));
    const sections = (await getWebsiteSettings(db, s.tenant.id)).sections;
    expect(sections.at(-1)).toEqual({ key: "GALLERY", enabled: true });
    expect(sections).toHaveLength(DEFAULT_SECTIONS.length);
  });

  it("resizes website pictures to fit 1600 pixels", async () => {
    const s = await institute();
    const row = await s.upload();
    const meta = await sharp((await storage.get(row.objectKey))!).metadata();
    expect([meta.width, meta.height, meta.format]).toEqual([1600, 800, "jpeg"]);
  });
});

describe("the public website (D21, D58)", () => {
  it("is shown only while the Website module is on; the settings are kept while it's off (D5)", async () => {
    const s = await institute();
    expect(await getPublicWebsite(db, s.tenant.id)).toBeNull();
    await setModules(db, s.tenant.id, ["website"]);
    await saveWebsiteSettings(db, s.actor, input());
    expect((await getPublicWebsite(db, s.tenant.id))?.settings).toMatchObject({ theme: "MODERN", heroHeading: "Best coaching in town" });
    await setModules(db, s.tenant.id, ["website"], false);
    expect(await getPublicWebsite(db, s.tenant.id)).toBeNull();
    await setModules(db, s.tenant.id, ["website"]);
    expect((await getPublicWebsite(db, s.tenant.id))?.settings.theme).toBe("MODERN");
  });

  it("treats only the pictures the website uses as public", async () => {
    const s = await institute();
    const [hero, gallery, testimonial, unused, logo] = [await s.upload(), await s.upload(), await s.upload(), await s.upload(), await s.upload("LOGO")];
    await saveWebsiteSettings(db, s.actor, input({ heroImageFileId: hero.id }));
    await testDb.insert(galleryPhotos).values({ tenantId: s.tenant.id, fileId: gallery.id, sortOrder: 1, createdBy: s.actor.userId });
    await testDb.insert(testimonials).values({ tenantId: s.tenant.id, quote: "Great", name: "Anika", photoFileId: testimonial.id, sortOrder: 1, updatedBy: s.actor.userId });
    const publicIds = [];
    for (const f of [hero, gallery, testimonial, unused, logo]) if (await isPublicWebsiteImage(db, s.tenant.id, f.id)) publicIds.push(f.id);
    expect(publicIds).toEqual([hero.id, gallery.id, testimonial.id]);
    const other = await institute();
    expect(await isPublicWebsiteImage(db, other.tenant.id, hero.id)).toBe(false);
  });

  it("serves a used picture on the institute's own host only, while the module is on and the page is shown", async () => {
    const s = await institute();
    const other = await institute();
    const suspended = await institute("SUSPENDED");
    const gone = await institute("DEACTIVATED");
    const h = createWebsiteHandlers({ db, auth, host, storage });
    const get = (subdomain: string, id: string) => h.publicImage(new Request(`http://${subdomain}.localhost:3000/api/public/website-images/${id}`, { headers: { host: `${subdomain}.localhost:3000` } }), { id });

    const hero = await s.upload();
    await saveWebsiteSettings(db, s.actor, input({ heroImageFileId: hero.id }));
    expect((await get(s.subdomain, hero.id)).status).toBe(404); // module off
    await setModules(db, s.tenant.id, ["website"]);
    const res = await get(s.subdomain, hero.id);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/jpeg");
    expect(res.headers.get("cache-control")).toContain("public");
    expect((await get(other.subdomain, hero.id)).status).toBe(404); // another institute's host
    expect((await get(s.subdomain, "not-a-uuid")).status).toBe(404);

    for (const t of [suspended, gone]) {
      const pic = await t.upload();
      await saveWebsiteSettings(db, t.actor, input({ heroImageFileId: pic.id }));
      await setModules(db, t.tenant.id, ["website"]);
      expect((await get(t.subdomain, pic.id)).status).toBe(t === suspended ? 200 : 404); // D58
    }
  });
});
