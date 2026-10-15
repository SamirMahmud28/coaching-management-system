"use client";

import { useQuery } from "@tanstack/react-query";
import { CalendarClock, Check, UserRound } from "lucide-react";
import Link from "next/link";
import { SectionCard } from "@/components/shared/section-card";
import { CardSkeleton, EmptyState, ErrorState } from "@/components/shared/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { dashboardApi, type DashboardClass } from "../../api";
import { instituteKeys } from "../../keys";

const SHOWN = 8;

/** Today's classes with who teaches them and whether the register is taken (in place of staff attendance). */
export function TodaysClasses() {
  const query = useQuery({ queryKey: instituteKeys.dashboard("classes"), queryFn: dashboardApi.classes, refetchInterval: 5 * 60_000 });

  return (
    <SectionCard
      title="Today's classes"
      description="Who teaches what today, and which registers are done"
      icon={CalendarClock}
      actions={
        <Button variant="ghost" size="sm" asChild>
          <Link href="/app/attendance">See all</Link>
        </Button>
      }
    >
      {query.isPending ? (
        <CardSkeleton height={220} className="border-0 p-0 shadow-none" />
      ) : query.error ? (
        <ErrorState onRetry={() => query.refetch()} />
      ) : !query.data.classes.length ? (
        <EmptyState icon={CalendarClock} title="No classes today" description="Classes come from each batch's weekly schedule." />
      ) : (
        <div className="space-y-4">
          <dl className="grid grid-cols-3 gap-3 text-center">
            {[
              ["Classes today", query.data.counts.total, "bg-sky-500/10 text-sky-700 dark:text-sky-300"],
              ["Registers taken", query.data.counts.taken, "bg-success/12 text-emerald-700 dark:text-emerald-300"],
              ["Not taken yet", query.data.counts.not_yet, "bg-warning/12 text-amber-700 dark:text-amber-300"],
            ].map(([label, value, tone]) => (
              <div key={label as string} className={cn("rounded-xl px-2 py-2.5", tone as string)}>
                <dd className="text-xl font-bold tabular-nums">{value}</dd>
                <dt className="text-[11px] font-medium">{label}</dt>
              </div>
            ))}
          </dl>
          <ul className="surface-glass-dense divide-y overflow-hidden rounded-xl border">
            {query.data.classes.slice(0, SHOWN).map((c) => (
              <ClassRow key={`${c.batch_subject_id}-${c.starts_at}`} c={c} date={query.data.date} canTake={query.data.can_take} />
            ))}
          </ul>
          {query.data.classes.length > SHOWN && (
            <p className="text-center text-xs text-muted-foreground">
              {query.data.classes.length - SHOWN} more ·{" "}
              <Link href="/app/attendance" className="font-medium text-primary-strong hover:underline">
                see all classes
              </Link>
            </p>
          )}
        </div>
      )}
    </SectionCard>
  );
}

function ClassRow({ c, date, canTake }: { c: DashboardClass; date: string; canTake: boolean }) {
  const open = c.state === "NOT_TAKEN" || c.state === "OPEN";
  const href = `/app/attendance/register?bs=${c.batch_subject_id}&date=${date}&at=${c.starts_at}`;
  return (
    <li className="flex items-center gap-3 px-3 py-2.5">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-3">
      <span className="shrink-0 text-xs font-semibold tabular-nums sm:w-24">
        {c.starts_at}–{c.ends_at}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          {c.subject_name} <span className="text-muted-foreground">· {c.batch_name}</span>
        </p>
        <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
          <UserRound className="size-3 shrink-0" aria-hidden="true" />
          {c.instructors.length ? c.instructors.join(", ") : "No instructor assigned"}
          {c.substitute && <Badge variant="warning" className="ml-1 h-4 px-1.5 text-[10px]">Substitute</Badge>}
        </p>
      </div>
      </div>
      <div className="ml-auto shrink-0">
        {c.state === "TAKEN" ? (
          <Badge variant="success" className="gap-1">
            <Check className="size-3" aria-hidden="true" /> Taken{c.counts ? ` · ${c.counts.present + c.counts.late}/${c.counts.present + c.counts.late + c.counts.absent}` : ""}
          </Badge>
        ) : c.state === "NOT_HELD" ? (
          <Badge variant="secondary" title={c.not_held_reason ?? undefined}>Not held</Badge>
        ) : canTake ? (
          <Button size="sm" variant={c.ended ? "default" : "outline"} asChild>
            <Link href={href}>{c.state === "OPEN" ? "Finish register" : "Take register"}</Link>
          </Button>
        ) : (
          <Badge variant={c.ended && open ? "warning" : "secondary"}>{c.ended ? "Not taken" : "Upcoming"}</Badge>
        )}
      </div>
    </li>
  );
}
