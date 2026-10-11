import { describe, expect, it } from "vitest";
import { humanizeAction } from "./format";

describe("humanizeAction", () => {
  it("turns an audit action code into a sentence, calling tenants institutes", () => {
    expect(humanizeAction("MODULE_ENTITLEMENT_CHANGED")).toBe("Module entitlement changed");
    expect(humanizeAction("TENANT_SUSPENDED")).toBe("Institute suspended");
  });
});
