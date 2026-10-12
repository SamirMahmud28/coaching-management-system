const PORT = 3100; // keep in sync with playwright.config.ts

export const siteUrl = (path = "/") => `http://localhost:${PORT}${path}`;
export const platformUrl = (path = "/") => `http://admin.localhost:${PORT}${path}`;
export const instituteUrl = (subdomain: string, path = "/") => `http://${subdomain}.localhost:${PORT}${path}`;

/** Sign-in is rate limited (10/min per address), which a whole suite on one machine would trip; clear it before signing in. */
export async function clearRateLimits() {
  const { config: loadEnv } = await import("dotenv");
  loadEnv({ path: ".env.test", override: true, quiet: true });
  const { createTestDb } = await import("../src/server/core/testing/db");
  const { sql } = await import("drizzle-orm");
  const { db, close } = createTestDb();
  try {
    await db.execute(sql`DELETE FROM rate_limits`);
  } finally {
    await close();
  }
}

/** Creates an active institute through the real platform service, as a Super Admin would. */
export async function seedInstitute(input: { name: string; subdomain: string; ownerName: string; ownerEmail: string; password: string; modules: string[] }) {
  const { config: loadEnv } = await import("dotenv");
  loadEnv({ path: ".env.test", override: true, quiet: true });
  const { createTestDb } = await import("../src/server/core/testing/db");
  const { createTenant } = await import("../src/server/modules/platform/service");
  const { sql } = await import("drizzle-orm");
  const { db, close } = createTestDb();
  try {
    const [admin] = await db.execute<{ id: string }>(sql`select id from platform_users order by created_at limit 1`);
    await createTenant(
      db as never,
      {
        name: input.name,
        subdomain: input.subdomain,
        starterModuleKeys: input.modules as never,
        ownerName: input.ownerName,
        ownerEmail: input.ownerEmail,
        temporaryPassword: input.password,
      },
      { platformUserId: admin.id },
    );
  } finally {
    await close();
  }
}

/** Sets an institute's status directly (what the Super Admin's status actions do), for pages that depend on it. */
export async function setInstituteStatus(subdomain: string, status: "ACTIVE" | "SUSPENDED" | "DEACTIVATED") {
  const { config: loadEnv } = await import("dotenv");
  loadEnv({ path: ".env.test", override: true, quiet: true });
  const { createTestDb } = await import("../src/server/core/testing/db");
  const { sql } = await import("drizzle-orm");
  const { db, close } = createTestDb();
  try {
    await db.execute(sql`update tenants set status = ${status} where subdomain = ${subdomain}`);
  } finally {
    await close();
  }
}

/** Switches modules on or off directly (what the Super Admin's module toggles do), e.g. `{ fees: false }`. */
export async function setInstituteModules(subdomain: string, changes: Record<string, boolean>) {
  const { config: loadEnv } = await import("dotenv");
  loadEnv({ path: ".env.test", override: true, quiet: true });
  const { createTestDb } = await import("../src/server/core/testing/db");
  const { sql } = await import("drizzle-orm");
  const { db, close } = createTestDb();
  try {
    for (const [key, enabled] of Object.entries(changes)) {
      await db.execute(sql`
        insert into tenant_modules (tenant_id, module_id, enabled, enabled_at)
        select t.id, m.id, ${enabled}, case when ${enabled} then now() end from tenants t, modules m
        where t.subdomain = ${subdomain} and m.key = ${key}
        on conflict (tenant_id, module_id) do update set enabled = excluded.enabled, enabled_at = excluded.enabled_at`);
    }
  } finally {
    await close();
  }
}
