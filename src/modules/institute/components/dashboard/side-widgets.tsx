"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CalendarDays, CalendarOff, CheckCircle2, Circle, ClipboardList, Clock, Info, Megaphone, Pin, Plus, RefreshCcw, Rocket, UserRoundCog, XCircle } from "lucide-react";
import Link from "next/link";
import { SectionCard } from "@/components/shared/section-card";
import { CardSkeleton, ErrorState } from "@/components/shared/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { dashboardApi, websiteContentApi, type DashboardAttentionItem, type DashboardUpcomingItem } from "../../api";
import { instituteKeys } from "../../keys";

const quiet = "border-0 p-0 shadow-none";

// ---------------------------------------------------------------------------------------------------------------------

const TONE: Record<DashboardAttentionItem["tone"], { icon: React.ComponentType<{ className?: string }>; box: string; label: string }> = {
  critical: { icon: AlertTriangle, box: "border-destructive/30 bg-destructive/8 text-red-700 dark:text-red-300", label: "Urgent" },
  warning: { icon: Clock, box: "border-warning/40 bg-warning/10 text-amber-700 dark:text-amber-300", label: "Soon" },
  info: { icon: Info, box: "border-info/30 bg-info/8 text-blue-700 dark:text-blue-300", label: "For you" },
};

/** What needs attention now, urgent first; each item only for those who can act on it (D163). */
export function PendingActions() {
  const query = useQuery({ queryKey: instituteKeys.dashboard("attention"), queryFn: dashboardApi.attention });
  const items = query.data?.items ?? [];
  return (
    <div id="pending-actions" className="scroll-mt-28">
      <SectionCard title="Pending actions" description={items.length ? `${items.length} to look at` : undefined} icon={ClipboardList}>
        {query.isPending ? (
          <CardSkeleton height={160} className={quiet} />
        ) : query.error ? (
          <ErrorState onRetry={() => query.refetch()} />
        ) : !items.length ? (
          <div className="flex items-center gap-3 rounded-xl border border-success/30 bg-success/8 p-4 text-sm">
            <CheckCircle2 className="size-5 text-emerald-600 dark:text-emerald-300" aria-hidden="true" />
            All caught up. Nothing needs your attention right now.
          </div>
        ) : (
          <ul className="space-y-2.5">
            {items.map((item) => {
              const t = TONE[item.tone];
              const Icon = t.icon;
              return (
                <li key={item.key} className={cn("flex items-start gap-3 rounded-xl border p-3", t.box)}>
                  <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  <div className="min-w-0 flex-1 text-foreground">
                    <p className="text-sm font-semibold">
                      <span className="sr-only">{t.label}: </span>
                      {item.title}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">{item.detail}</p>
                  </div>
                  <Button size="sm" variant="outline" className="h-7 shrink-0 bg-card px-2.5 text-xs" asChild>
                    <Link href={item.href} aria-label={`Open: ${item.title}`}>
                      Open
                    </Link>
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------------

const KIND: Record<DashboardUpcomingItem["kind"], { icon: React.ComponentType<{ className?: string }>; label: string; tone: string }> = {
  EXAM: { icon: ClipboardList, label: "Exam", tone: "bg-violet-500/12 text-violet-700 dark:text-violet-300" },
  HOLIDAY: { icon: CalendarOff, label: "Holiday", tone: "bg-sky-500/12 text-sky-700 dark:text-sky-300" },
  CANCELLED: { icon: XCircle, label: "Cancelled", tone: "bg-destructive/10 text-red-700 dark:text-red-300" },
  SUBSTITUTE: { icon: UserRoundCog, label: "Substitute", tone: "bg-warning/12 text-amber-700 dark:text-amber-300" },
  RESCHEDULED: { icon: RefreshCcw, label: "Moved", tone: "bg-accent text-accent-foreground" },
};

const dayOf = (iso: string) => new Date(`${iso}T00:00:00Z`).getUTCDate();
const monthOf = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" });

/** Exams, holidays and class changes in the next 14 days. */
export function ComingUp() {
  const query = useQuery({ queryKey: instituteKeys.dashboard("upcoming"), queryFn: dashboardApi.upcoming });
  return (
    <SectionCard title="Coming up" description="The next 14 days" icon={CalendarDays}>
      {query.isPending ? (
        <CardSkeleton height={140} className={quiet} />
      ) : query.error ? (
        <ErrorState onRetry={() => query.refetch()} />
      ) : !query.data.items.length ? (
        <p className="text-sm text-muted-foreground">No exams, holidays or class changes in the next two weeks.</p>
      ) : (
        <ul className="space-y-2">
          {query.data.items.map((item) => {
            const k = KIND[item.kind];
            const Icon = k.icon;
            return (
              <li key={item.key}>
                <Link href={item.href} className="flex items-center gap-3 rounded-xl p-1.5 transition-colors outline-none hover:bg-muted/60 focus-visible:ring-[3px] focus-visible:ring-ring/50">
                  <span className="grid w-11 shrink-0 place-items-center rounded-lg border bg-card py-1 text-center leading-none shadow-xs">
                    <span className="text-base font-bold tabular-nums">{dayOf(item.date)}</span>
                    <span className="text-[10px] font-medium text-muted-foreground uppercase">{monthOf(item.date)}</span>
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{item.title}</p>
                    <p className="truncate text-xs text-muted-foreground">{item.detail}</p>
                  </div>
                  <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium", k.tone)}>
                    <Icon className="size-3" aria-hidden="true" />
                    {k.label}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------------------------------------------------

/** The latest website notices, with a shortcut to add one (Website module). */
export function NoticesCard() {
  const query = useQuery({ queryKey: instituteKeys.website("notices"), queryFn: websiteContentApi.notices });
  const items = (query.data?.items ?? []).filter((n) => n.status !== "HIDDEN").slice(0, 5);
  return (
    <SectionCard
      title="Notices"
      icon={Megaphone}
      actions={
        <Button size="sm" variant="outline" className="h-7 px-2.5 text-xs" asChild>
          <Link href="/app/website/notices">
            <Plus className="size-3.5" /> Add
          </Link>
        </Button>
      }
    >
      {query.isPending ? (
        <CardSkeleton height={120} className={quiet} />
      ) : query.error ? (
        <ErrorState onRetry={() => query.refetch()} />
      ) : !items.length ? (
        <p className="text-sm text-muted-foreground">No notices yet. Notices appear on your website for visitors and students.</p>
      ) : (
        <ul className="space-y-3">
          {items.map((n) => (
            <li key={n.id} className="flex items-start gap-3">
              <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-accent text-primary-strong" aria-hidden="true">
                {n.pinned ? <Pin className="size-4" /> : <Megaphone className="size-4" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{n.title}</p>
                <p className="truncate text-xs text-muted-foreground">{n.body}</p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-[11px] text-muted-foreground tabular-nums">{formatDate(n.notice_date)}</p>
                {n.status === "SCHEDULED" && (
                  <Badge variant="info" className="mt-0.5 h-4 px-1.5 text-[10px]">
                    Scheduled
                  </Badge>
                )}
                {n.status === "EXPIRED" && (
                  <Badge variant="secondary" className="mt-0.5 h-4 px-1.5 text-[10px]">
                    Ended
                  </Badge>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------------------------------------------------

/** A new institute's first steps; hidden once every step is done. */
export function SetupChecklist() {
  const query = useQuery({ queryKey: instituteKeys.dashboard("setup"), queryFn: dashboardApi.setup });
  if (!query.data || query.data.done === query.data.steps.length) return null;
  const { steps, done } = query.data;
  return (
    <SectionCard title="Set up your institute" description={`${done} of ${steps.length} done`} icon={Rocket}>
      <Progress value={(done * 100) / steps.length} aria-label="Set-up progress" className="mb-4" />
      <ol className="space-y-1">
        {steps.map((s) => (
          <li key={s.key}>
            <Link
              href={s.href}
              className={cn("flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm transition-colors outline-none hover:bg-muted/60 focus-visible:ring-[3px] focus-visible:ring-ring/50", s.done && "text-muted-foreground line-through")}
            >
              {s.done ? <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-300" aria-hidden="true" /> : <Circle className="size-4 text-muted-foreground" aria-hidden="true" />}
              <span className="sr-only">{s.done ? "Done: " : "To do: "}</span>
              {s.title}
            </Link>
          </li>
        ))}
      </ol>
    </SectionCard>
  );
}
