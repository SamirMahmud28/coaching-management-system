import { config as loadEnv } from "dotenv";

export const E2E_ADMIN = { name: "E2E Admin", email: "e2e-admin@platform.test", password: "E2eAdmin123" };
export const E2E_INSTITUTE = { name: "Demo Coaching Centre", subdomain: "demo" };

/** Resets the test database, seeds the catalog, and creates one Platform Admin and one active institute. */
export default async function globalSetup() {
  loadEnv({ path: ".env.test", override: true, quiet: true });
  const { createTestDb } = await import("../src/server/core/testing/db");
  const { seedPlatformCatalog } = await import("../src/server/core/db/seed");
  const { createPlatformLogin } = await import("../src/server/modules/auth/platform-credentials");
  const { sql } = await import("drizzle-orm");

  const { db, reset, close } = createTestDb();
  try {
    await reset();
    await seedPlatformCatalog(db as never);
    await createPlatformLogin(db as never, { ...E2E_ADMIN, mustChangePassword: false });
    await db.execute(sql`insert into tenants (name, subdomain, status) values (${E2E_INSTITUTE.name}, ${E2E_INSTITUTE.subdomain}, 'ACTIVE')`);
  } finally {
    await close();
  }
}
