/** A real YYYY-MM-DD calendar date (rejects 2026-02-30). */
export function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

const dhakaDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dhaka", year: "numeric", month: "2-digit", day: "2-digit" });

/** Today's date in Bangladesh as YYYY-MM-DD; dates such as admission and batch joining are Bangladesh calendar days. */
export const todayInDhaka = (now: Date = new Date()) => dhakaDate.format(now);

/** The calendar date `days` after (or before, when negative) a YYYY-MM-DD date. */
export const addDays = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

/** The weekday of a calendar date, in the schedule's names (the Bangladesh week starts on Saturday). */
export function weekdayOf(date: string): "SAT" | "SUN" | "MON" | "TUE" | "WED" | "THU" | "FRI" {
  return (["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"] as const)[new Date(`${date}T00:00:00Z`).getUTCDay()];
}
