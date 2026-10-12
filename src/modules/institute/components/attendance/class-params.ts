import { isCalendarDate } from "@/lib/dates";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A register's address in the URL (`?bs=&date=&at=`), or null when malformed (the page is then a 404). */
export function classParams(q: Record<string, string | undefined>) {
  const { bs, date, at } = q;
  if (!bs || !UUID.test(bs) || !date || !isCalendarDate(date) || !at || !/^\d{2}:\d{2}$/.test(at)) return null;
  return { batchSubjectId: bs, date, startsAt: at };
}
