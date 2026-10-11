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
