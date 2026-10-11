import { afterAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { createTestDb } from "../testing/db";

/**
 * Tenant-isolation guard (docs/04-ARCHITECTURE.md §3): a foreign key between two tenant-scoped tables must include
 * tenant_id, so a row can never point at another institute's row. These are the reviewed exceptions: each one is set
 * by the server, never taken from client input. A new single-column FK fails this test until it's made composite
 * or reviewed and added here.
 */
const REVIEWED = [
  "audit_logs.user_id -> users", // audit_logs is platform-wide (tenant_id nullable); the actor is the signed-in user
  // A file reference must stay a single column: ON DELETE SET NULL on a composite key would null tenant_id too.
  // The tenant is checked by assertFileReference before it's stored.
  "institution_profiles.logo_file_id -> files",
  "instructors.photo_file_id -> files",
  "signatures.signature_file_id -> files",
];

const { db, close } = createTestDb();
afterAll(async () => {
  await close();
});

describe("tenant foreign keys", () => {
  it("links tenant-scoped tables only through tenant_id, apart from the reviewed exceptions", async () => {
    const rows = await db.execute<{ fk: string }>(sql`
      select src.relname || '.' || string_agg(a.attname, ',') || ' -> ' || tgt.relname as fk
      from pg_constraint c
      join pg_class src on src.oid = c.conrelid
      join pg_class tgt on tgt.oid = c.confrelid
      join lateral unnest(c.conkey) k(attnum) on true
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum
      where c.contype = 'f'
        and exists (select 1 from pg_attribute where attrelid = c.conrelid and attname = 'tenant_id' and not attisdropped)
        and exists (select 1 from pg_attribute where attrelid = c.confrelid and attname = 'tenant_id' and not attisdropped)
      group by c.oid, src.relname, tgt.relname
      having not bool_or(a.attname = 'tenant_id')
    `);
    expect([...rows].map((r) => r.fk).sort()).toEqual([...REVIEWED].sort());
  });
});
