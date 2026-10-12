import { describe, expect, it } from "vitest";
import { toSnakeCaseKeys } from "./case";

describe("toSnakeCaseKeys", () => {
  it("snake-cases camelCase keys, deeply, and leaves dates and values alone", () => {
    const when = new Date("2026-10-12T00:00:00Z");
    expect(toSnakeCaseKeys({ fullName: "A", paidBy: { receiptLabel: "R-1" }, lines: [{ chargeId: "x" }], at: when, id: "id" })).toEqual({
      full_name: "A", paid_by: { receipt_label: "R-1" }, lines: [{ charge_id: "x" }], at: when, id: "id",
    });
  });

  it("keeps constant-style keys such as enum names used as map keys", () => {
    expect(toSnakeCaseKeys({ skipped: { ON_HOLD: 1, ALREADY_CHARGED: 2, EXCLUDED: 3 } })).toEqual({ skipped: { ON_HOLD: 1, ALREADY_CHARGED: 2, EXCLUDED: 3 } });
  });
});
