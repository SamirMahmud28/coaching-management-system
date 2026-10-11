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
