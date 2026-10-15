import { describe, expect, it } from "vitest";
import { statusChangeProblem, type StudentStatus } from "./service";

const ALL: StudentStatus[] = ["ACTIVE", "ON_HOLD", "COMPLETED", "LEFT"];

describe("student status transitions", () => {
  it("allows exactly the decided moves", () => {
    const allowed = ALL.flatMap((from) => ALL.filter((to) => statusChangeProblem(from, to, "a reason") === null).map((to) => `${from}->${to}`));
    expect(allowed.sort()).toEqual(
      ["ACTIVE->ON_HOLD", "ACTIVE->COMPLETED", "ACTIVE->LEFT", "ON_HOLD->ACTIVE", "ON_HOLD->COMPLETED", "ON_HOLD->LEFT", "COMPLETED->ACTIVE", "LEFT->ACTIVE"].sort(),
    );
  });

  it("needs a reason for leaving and for reactivating, but not for holding or completing", () => {
    expect(statusChangeProblem("ACTIVE", "LEFT", null)?.code).toBe("VALIDATION_REASON_REQUIRED");
    expect(statusChangeProblem("ON_HOLD", "LEFT", null)?.code).toBe("VALIDATION_REASON_REQUIRED");
    expect(statusChangeProblem("LEFT", "ACTIVE", null)?.code).toBe("VALIDATION_REASON_REQUIRED");
    expect(statusChangeProblem("COMPLETED", "ACTIVE", null)?.code).toBe("VALIDATION_REASON_REQUIRED");
    expect(statusChangeProblem("ACTIVE", "ON_HOLD", null)).toBeNull();
    expect(statusChangeProblem("ON_HOLD", "ACTIVE", null)).toBeNull();
    expect(statusChangeProblem("ACTIVE", "COMPLETED", null)).toBeNull();
  });

  it("refuses no-op and undecided moves", () => {
    expect(statusChangeProblem("ACTIVE", "ACTIVE", null)?.code).toBe("CONFLICT_STATUS_UNCHANGED");
    expect(statusChangeProblem("COMPLETED", "LEFT", "x")?.code).toBe("CONFLICT_STATUS_TRANSITION");
    expect(statusChangeProblem("LEFT", "ON_HOLD", "x")?.code).toBe("CONFLICT_STATUS_TRANSITION");
  });
});
