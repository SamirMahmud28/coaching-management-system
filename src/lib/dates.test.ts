import { describe, expect, it } from "vitest";
import { isCalendarDate, todayInDhaka } from "./dates";

describe("dates", () => {
  it("accepts only real calendar dates", () => {
    expect(isCalendarDate("2026-02-28")).toBe(true);
    expect(isCalendarDate("2028-02-29")).toBe(true);
    expect(isCalendarDate("2026-02-30")).toBe(false);
    expect(isCalendarDate("2026-2-3")).toBe(false);
  });

  it("gives Bangladesh's date, which is ahead of UTC (UTC+6)", () => {
    expect(todayInDhaka(new Date("2026-12-31T17:59:00Z"))).toBe("2026-12-31");
    expect(todayInDhaka(new Date("2026-12-31T18:00:00Z"))).toBe("2027-01-01");
  });
});
