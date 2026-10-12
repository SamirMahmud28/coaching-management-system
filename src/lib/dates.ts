/** A real YYYY-MM-DD calendar date (rejects 2026-02-30). */
export function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

const dhakaDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dhaka", year: "numeric", month: "2-digit", day: "2-digit" });

/** Today's date in Bangladesh as YYYY-MM-DD; dates such as admission and batch joining are Bangladesh calendar days. */
export const todayInDhaka = (now: Date = new Date()) => dhakaDate.format(now);
