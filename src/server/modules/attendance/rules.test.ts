import { describe, expect, it } from "vitest";
import { editRule, effectiveStatus, tally } from "./rules";

describe("attendance rules", () => {
  it("shows Excused while approved leave covers a class, otherwise what was marked", () => {
    expect(effectiveStatus({ status: "ABSENT", leaveId: "leave-1" })).toBe("EXCUSED");
    expect(effectiveStatus({ status: null, leaveId: "leave-1" })).toBe("EXCUSED");
    expect(effectiveStatus({ status: "ABSENT", leaveId: null })).toBe("ABSENT");
    expect(effectiveStatus({ status: null, leaveId: null })).toBeNull();
  });

  it("counts Present and Late as attended, leaves Excused and unmarked out", () => {
    const statuses = [...Array(18).fill("PRESENT"), "LATE", "LATE", "ABSENT", "ABSENT", "EXCUSED", "EXCUSED", "EXCUSED", null] as const;
    expect(tally(statuses)).toEqual({ present: 18, late: 2, absent: 2, excused: 3, percentage: 90.9 });
    expect(tally(["EXCUSED", null]).percentage).toBeNull();
    expect(tally(["ABSENT"]).percentage).toBe(0);
  });

  it("lets anyone who may mark do so on the class day; afterwards only managers, with a reason", () => {
    expect(editRule("2026-10-12", "2026-10-12", false)).toEqual({ allowed: true, reasonRequired: false });
    expect(editRule("2026-10-11", "2026-10-12", false).allowed).toBe(false);
    expect(editRule("2026-10-11", "2026-10-12", true)).toEqual({ allowed: true, reasonRequired: true });
    expect(editRule("2026-10-13", "2026-10-12", true).allowed).toBe(false);
  });
});
