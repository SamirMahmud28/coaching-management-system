import { CalendarClock } from "lucide-react";
import { StatusBadge } from "@/components/shared/status-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate } from "@/lib/format";
import type { myLessonProgress } from "@/server/modules/routine/portal";
import type { RoutineClass } from "@/server/modules/routine/service";
import { ProgressBar } from "../routine/lessons-pages";

const STATUS: Record<RoutineClass["status"], { label: string; tone: "success" | "secondary" | "warning" | "info" | "destructive" }> = {
  SCHEDULED: { label: "Substitute", tone: "info" },
  CANCELLED: { label: "Cancelled", tone: "destructive" },
  HOLIDAY: { label: "Holiday", tone: "secondary" },
  MOVED_AWAY: { label: "Moved", tone: "warning" },
  MOVED_IN: { label: "Moved here", tone: "info" },
};

function note(c: RoutineClass) {
  if (c.status === "MOVED_AWAY" && c.movedTo) return `Moved to ${formatDate(c.movedTo.date)}, ${c.movedTo.startsAt}–${c.movedTo.endsAt}`;
  if (c.status === "MOVED_IN" && c.movedFrom) return `Moved from ${formatDate(c.movedFrom.date)}, ${c.movedFrom.startsAt}`;
  if (c.status === "CANCELLED" || c.status === "HOLIDAY") return c.reason;
  return c.substituteName ? `Substitute: ${c.substituteName}` : null;
}

/** Changes to the viewer's classes in the next two weeks (D117), on the portal home pages. */
export function UpcomingChangesCard({ changes }: { changes: RoutineClass[] }) {
  return (
    <Card data-testid="upcoming-changes">
      <CardHeader>
        <CardTitle>Schedule changes</CardTitle>
        <CardDescription>Cancelled, moved or substituted classes and holidays in the next two weeks.</CardDescription>
      </CardHeader>
      <CardContent>
        {changes.length === 0 ? (
          <p className="text-sm text-muted-foreground">No changes — classes run at their usual times.</p>
        ) : (
          <ul className="surface-glass-dense divide-y rounded-md border text-sm">
            {changes.map((c) => (
              <li key={`${c.batchSubjectId}-${c.date}-${c.startsAt}-${c.status}`} className="flex items-start gap-3 px-3 py-2">
                <CalendarClock aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {formatDate(c.date)}, {c.startsAt} · {c.subjectName} <span className="font-normal text-muted-foreground">({c.batchName})</span>
                  </p>
                  {note(c) && <p className="text-muted-foreground">{note(c)}</p>}
                </div>
                <StatusBadge status={c.status} label={STATUS[c.status].label} tone={STATUS[c.status].tone} />
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

/** A student's lesson progress per subject (D27, D118). */
export function LessonProgressCard({ plans }: { plans: Awaited<ReturnType<typeof myLessonProgress>> }) {
  return (
    <Card data-testid="lesson-progress">
      <CardHeader>
        <CardTitle>Lesson progress</CardTitle>
        <CardDescription>What each subject has covered so far, from the instructors&apos; lesson plans.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {plans.length === 0 ? (
          <p className="text-sm text-muted-foreground">No lesson plans yet.</p>
        ) : (
          plans.map((p) => (
            <details key={p.id} className="surface-glass-item rounded-md border px-3 py-2">
              <summary className="cursor-pointer list-none">
                <p className="mb-1 text-sm font-medium">
                  {p.subjectName} <span className="font-normal text-muted-foreground">· {p.batchName}</span>
                </p>
                <ProgressBar progress={p.progress} />
              </summary>
              <ol className="mt-2 space-y-1 text-sm">
                {p.topics.map((t, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <span className="flex-1">{t.title}</span>
                    {t.overdue && <StatusBadge status="OVERDUE" label="Overdue" tone="destructive" />}
                    <StatusBadge status={t.status} label={t.status === "COMPLETED" ? "Done" : t.status === "ONGOING" ? "Ongoing" : "Pending"} tone={t.status === "COMPLETED" ? "success" : t.status === "ONGOING" ? "info" : "secondary"} />
                  </li>
                ))}
              </ol>
            </details>
          ))
        )}
      </CardContent>
    </Card>
  );
}
