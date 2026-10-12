import { describe, expect, it } from "vitest";
import { describeReference, formatAmount, humanizeAction } from "./format";

describe("humanizeAction", () => {
  it("turns an audit action code into a sentence, calling tenants institutes", () => {
    expect(humanizeAction("MODULE_ENTITLEMENT_CHANGED")).toBe("Module entitlement changed");
    expect(humanizeAction("TENANT_SUSPENDED")).toBe("Institute suspended");
  });
});

describe("describeReference", () => {
  it("counts in-use references in plain words", () => {
    expect(describeReference("SUBJECT", 2)).toBe("2 subjects");
    expect(describeReference("BATCH", 1)).toBe("1 batch");
    expect(describeReference("BATCH", 3)).toBe("3 batches");
    expect(describeReference("BATCH_MEMBERSHIP", 4)).toBe("4 batch memberships");
    expect(describeReference("students", 3)).toBe("3 students");
  });
});

describe("formatAmount", () => {
  it("shows taka with Bangladeshi grouping", () => {
    expect(formatAmount("200000.50")).toBe("৳2,00,000.50");
    expect(formatAmount("0.00")).toBe("৳0.00");
    expect(formatAmount(null)).toBe("—");
  });
});
