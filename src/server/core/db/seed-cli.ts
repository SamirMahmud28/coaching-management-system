import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import { syncSystemRolePermissions } from "../../modules/rbac/service";
import { seedPlatformCatalog } from "./seed";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set (see .env.example)");
  const client = postgres(url, { max: 1, onnotice: () => {} });
  try {
    const db = drizzle(client, { schema });
    const result = await seedPlatformCatalog(db);
    console.log(
      `Seeded ${result.modules} modules, ${result.dependencies} module dependencies, ${result.permissions} permissions.`,
    );
    // New permissions reach existing institutes' system roles (e.g. Owner) on every deploy.
    const synced = await syncSystemRolePermissions(db);
    console.log(`Created ${synced.rolesCreated} new system role(s); granted ${synced.granted} new permission(s) to system roles.`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
