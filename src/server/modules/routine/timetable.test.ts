import { describe, expect, it } from "vitest";
import { datesBetween, expandTimetable, overlaps, takesPlace, type Change, type Holiday, type Slot } from "./timetable";

// 2026-11-07 is a Saturday; 2026-11-08 a Sunday.
const slots: Slot[] = [
  { batchSubjectId: "phy", weekday: "SAT", startsAt: "09:00:00", endsAt: "10:00:00" },
  { batchSubjectId: "chem", weekday: "SAT", startsAt: "10:30:00", endsAt: "11:30:00" },
  { batchSubjectId: "phy", weekday: "SUN", startsAt: "09:00:00", endsAt: "10:00:00" },
];
const change = (o: Partial<Change> & Pick<Change, "kind">): Change => ({
  id: `c-${o.kind}`, batchSubjectId: "phy", classDate: "2026-11-07", startsAt: "09:00", reason: null, newDate: null, newStartsAt: null, newEndsAt: null, substituteInstructorId: null, ...o,
});
const view = (cs: ReturnType<typeof expandTimetable>) => cs.map((c) => [c.date, c.batchSubjectId, c.startsAt, c.status]);

describe("expanding the weekly times", () => {
  it("lists every class of every date in the range, in date and time order", () => {
    expect(view(expandTimetable({ slots, changes: [], holidays: [], from: "2026-11-07", to: "2026-11-09" }))).toEqual([
      ["2026-11-07", "phy", "09:00", "SCHEDULED"],
      ["2026-11-07", "chem", "10:30", "SCHEDULED"],
      ["2026-11-08", "phy", "09:00", "SCHEDULED"],
    ]);
    expect(datesBetween("2026-12-30", "2027-01-02")).toEqual(["2026-12-30", "2026-12-31", "2027-01-01", "2027-01-02"]);
  });
});

describe("one-off changes and holidays", () => {
  it("cancels one class with its reason and leaves the others", () => {
    const out = expandTimetable({ slots, changes: [change({ kind: "CANCEL", reason: "Instructor ill" })], holidays: [], from: "2026-11-07", to: "2026-11-07" });
    expect(out.find((c) => c.batchSubjectId === "phy")).toMatchObject({ status: "CANCELLED", reason: "Instructor ill", changeId: "c-CANCEL" });
    expect(out.find((c) => c.batchSubjectId === "chem")).toMatchObject({ status: "SCHEDULED" });
  });

  it("moves a rescheduled class: away from the old date and in on the new one, even outside the range", () => {
    const moved = change({ kind: "RESCHEDULE", newDate: "2026-11-09", newStartsAt: "16:00", newEndsAt: "17:00" });
    const out = expandTimetable({ slots, changes: [moved], holidays: [], from: "2026-11-07", to: "2026-11-09" });
    expect(out.find((c) => c.date === "2026-11-07" && c.batchSubjectId === "phy")).toMatchObject({ status: "MOVED_AWAY", movedTo: { date: "2026-11-09", startsAt: "16:00", endsAt: "17:00" } });
    expect(out.find((c) => c.date === "2026-11-09")).toMatchObject({ status: "MOVED_IN", startsAt: "16:00", movedFrom: { date: "2026-11-07", startsAt: "09:00" } });
    // Looking only at the new date still shows the class that moved in.
    expect(view(expandTimetable({ slots, changes: [moved], holidays: [], from: "2026-11-09", to: "2026-11-09" }))).toEqual([["2026-11-09", "phy", "16:00", "MOVED_IN"]]);
  });

  it("gives a class a substitute without moving it", () => {
    const out = expandTimetable({ slots, changes: [change({ kind: "SUBSTITUTE", substituteInstructorId: "inst-2" })], holidays: [], from: "2026-11-07", to: "2026-11-07" });
    expect(out[0]).toMatchObject({ status: "SCHEDULED", substituteInstructorId: "inst-2" });
  });

  it("closes every class on a holiday, but a class moved away still leaves", () => {
    const holiday: Holiday = { id: "h1", name: "Victory Day", fromDate: "2026-11-07", toDate: "2026-11-08" };
    const moved = change({ kind: "RESCHEDULE", newDate: "2026-11-10", newStartsAt: "09:00", newEndsAt: "10:00" });
    const out = expandTimetable({ slots, changes: [moved], holidays: [holiday], from: "2026-11-07", to: "2026-11-10" });
    expect(view(out)).toEqual([
      ["2026-11-07", "phy", "09:00", "MOVED_AWAY"],
      ["2026-11-07", "chem", "10:30", "HOLIDAY"],
      ["2026-11-08", "phy", "09:00", "HOLIDAY"],
      ["2026-11-10", "phy", "09:00", "MOVED_IN"],
    ]);
    expect(out[1].reason).toBe("Victory Day");
  });

  it("says which classes take place", () => {
    expect(["SCHEDULED", "MOVED_IN"].map((status) => takesPlace({ status: status as never }))).toEqual([true, true]);
    expect(["CANCELLED", "HOLIDAY", "MOVED_AWAY"].map((status) => takesPlace({ status: status as never }))).toEqual([false, false, false]);
  });
});

describe("overlaps", () => {
  it("treats touching times as free and any shared minute as a clash", () => {
    expect(overlaps({ startsAt: "09:00", endsAt: "10:00" }, { startsAt: "10:00", endsAt: "11:00" })).toBe(false);
    expect(overlaps({ startsAt: "09:00:00", endsAt: "10:00:00" }, { startsAt: "09:59", endsAt: "11:00" })).toBe(true);
  });
});
