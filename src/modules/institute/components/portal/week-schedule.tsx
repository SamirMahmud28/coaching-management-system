import type { Weekday } from "@/server/modules/academic/service";

export const DAY_NAME: Record<Weekday, string> = { SAT: "Saturday", SUN: "Sunday", MON: "Monday", TUE: "Tuesday", WED: "Wednesday", THU: "Thursday", FRI: "Friday" };
const ORDER: Weekday[] = ["SAT", "SUN", "MON", "TUE", "WED", "THU", "FRI"];

export interface WeekClass {
  weekday: Weekday;
  startsAt: string;
  endsAt: string;
  subjectName: string;
  batchName?: string;
}

/** A week of classes grouped by day, Saturday first (the Bangladesh week). */
export function WeekSchedule({ classes, empty = "No class times yet." }: { classes: WeekClass[]; empty?: string }) {
  if (!classes.length) return <p className="text-sm text-muted-foreground">{empty}</p>;
  const days = ORDER.filter((d) => classes.some((c) => c.weekday === d));
  return (
    <dl className="space-y-3 text-sm">
      {days.map((d) => (
        <div key={d} className="grid gap-1 sm:grid-cols-[7rem_1fr]">
          <dt className="font-medium">{DAY_NAME[d]}</dt>
          <dd>
            <ul className="space-y-1">
              {classes
                .filter((c) => c.weekday === d)
                .map((c, i) => (
                  <li key={i} className="flex flex-wrap gap-x-2">
                    <span className="font-mono">
                      {c.startsAt}–{c.endsAt}
                    </span>
                    <span>{c.subjectName}</span>
                    {c.batchName && <span className="text-muted-foreground">· {c.batchName}</span>}
                  </li>
                ))}
            </ul>
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** "Sat, Mon 16:00–17:30" style summary of one subject's class times. */
export function classTimes(slots: { weekday: Weekday; startsAt: string; endsAt: string }[]): string {
  if (!slots.length) return "Times not set";
  return slots.map((s) => `${DAY_NAME[s.weekday].slice(0, 3)} ${s.startsAt}–${s.endsAt}`).join(", ");
}
