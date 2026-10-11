import { describe, expect, it } from "vitest";
import { InUseError } from "./errors";
import { createReferenceRegistry } from "./references";
import type { DbOrTx } from "./db/types";

// Counters are plain functions, so the registry itself needs no database.
const noDb = {} as DbOrTx;

describe("reference registry", () => {
  it("returns only non-zero counts from every registered counter", async () => {
    const registry = createReferenceRegistry<"class">();
    registry.register("class", "sections", async () => 3);
    registry.register("class", "enrollments", async () => 0);
    registry.register("class", "subjects", async () => 11);

    expect(await registry.countReferences(noDb, "t1", "class", "c1")).toEqual([
      { type: "sections", count: 3 },
      { type: "subjects", count: 11 },
    ]);
  });

  it("passes tenant and id through to each counter", async () => {
    const registry = createReferenceRegistry<"class">();
    const seen: string[] = [];
    registry.register("class", "sections", async (_db, tenantId, id) => {
      seen.push(`${tenantId}/${id}`);
      return 0;
    });
    await registry.countReferences(noDb, "tenant-a", "class", "class-1");
    expect(seen).toEqual(["tenant-a/class-1"]);
  });

  it("throws InUseError with the counts when the record is referenced", async () => {
    const registry = createReferenceRegistry<"shift">();
    registry.register("shift", "students", async () => 40);
    const err = await registry.assertUnreferenced(noDb, "t1", "shift", "s1").catch((e) => e);
    expect(err).toBeInstanceOf(InUseError);
    expect(err.code).toBe("CONFLICT_SHIFT_IN_USE");
    expect(err.details).toEqual({ references: [{ type: "students", count: 40 }] });
  });

  it("allows the delete when nothing references the record", async () => {
    const registry = createReferenceRegistry<"shift">();
    registry.register("shift", "students", async () => 0);
    await expect(registry.assertUnreferenced(noDb, "t1", "shift", "s1")).resolves.toBeUndefined();
  });

  it("refuses to register the same counter twice", () => {
    const registry = createReferenceRegistry<"class">();
    registry.register("class", "sections", async () => 0);
    expect(() => registry.register("class", "sections", async () => 0)).toThrow(/already registered/);
  });
});
