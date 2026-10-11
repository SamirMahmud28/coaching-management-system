import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { sql } from "drizzle-orm";
import * as schema from "../db/schema";
import { assertTestDatabaseUrl } from "./test-database";

/** Real test database. Refuses any database not named `*_test`, so it can never truncate real data. */
export function createTestDb() {
  const url = process.env.DATABASE_URL;
  assertTestDatabaseUrl(url);

  const client = postgres(url!, { max: 1, onnotice: () => {} });
  const db = drizzle(client, { schema });

  async function reset() {
    const rows = await db.execute<{ tablename: string }>(
      sql`select tablename from pg_tables where schemaname = 'public' and tablename <> '__drizzle_migrations'`,
    );
    const tables = rows.map((r) => `"public"."${r.tablename}"`).join(", ");
    if (tables) await db.execute(sql.raw(`TRUNCATE ${tables} RESTART IDENTITY CASCADE`));
  }

  return { db, reset, close: () => client.end() };
}

export type TestDb = ReturnType<typeof createTestDb>["db"];
