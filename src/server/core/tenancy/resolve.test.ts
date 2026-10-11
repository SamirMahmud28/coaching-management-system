import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "../testing/db";
import { tenants } from "../db/schema";
import { resolveHost } from "./resolve";

const { db, reset, close } = createTestDb();
const config = { baseDomain: "localhost:3000", platformHost: "admin.localhost:3000" };

describe("resolveHost (real database)", () => {
  beforeEach(async () => {
    await reset();
    await db.insert(tenants).values([
      { name: "Greenfield", subdomain: "greenfield", status: "ACTIVE" },
      { name: "Old School", subdomain: "oldschool", status: "DEACTIVATED" },
    ]);
  });

  afterAll(async () => {
    await close();
  });

  it("resolves a school's subdomain to that school", async () => {
    const res = await resolveHost(db, "greenfield.localhost:3000", config);
    expect(res.kind).toBe("tenant");
    expect(res.kind === "tenant" && res.tenant.name).toBe("Greenfield");
  });

  it("resolves case-insensitively", async () => {
    const res = await resolveHost(db, "GreenField.localhost:3000", config);
    expect(res.kind === "tenant" && res.tenant.subdomain).toBe("greenfield");
  });

  it("gives an unused subdomain the same answer as a malformed host", async () => {
    expect(await resolveHost(db, "nosuchschool.localhost:3000", config)).toEqual({ kind: "not-found" });
    expect(await resolveHost(db, "evil.example.com", config)).toEqual({ kind: "not-found" });
  });

  it("still resolves a deactivated school — status is enforced by the authorization chain, not here", async () => {
    const res = await resolveHost(db, "oldschool.localhost:3000", config);
    expect(res.kind === "tenant" && res.tenant.status).toBe("DEACTIVATED");
  });

  it("recognizes the platform host and the bare domain without touching tenants", async () => {
    expect(await resolveHost(db, "admin.localhost:3000", config)).toEqual({ kind: "platform" });
    expect(await resolveHost(db, "localhost:3000", config)).toEqual({ kind: "root" });
  });
});
