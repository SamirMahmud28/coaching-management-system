"use client";

import { useQuery } from "@tanstack/react-query";
import { CalendarCheck, ListChecks, UserRound, Wallet } from "lucide-react";
import { StatCard } from "@/components/shared/stat-card";
import { StatCardsSkeleton } from "@/components/shared/states";
import { Progress } from "@/components/ui/progress";
import { formatTaka, toPoisha } from "@/lib/money";
import { dashboardApi } from "../../api";
import { instituteKeys } from "../../keys";

/** The KPI row: each card only for someone who may see its figure; the grid closes up around missing ones. */
export function KpiRow({ showPending }: { showPending: boolean }) {
  const summary = useQuery({ queryKey: instituteKeys.dashboard("summary"), queryFn: dashboardApi.summary });
  const attention = useQuery({ queryKey: instituteKeys.dashboard("attention"), queryFn: dashboardApi.attention, enabled: showPending });

  if (summary.isPending) return <StatCardsSkeleton count={4} />;
  const s = summary.data;
  const cards: React.ReactNode[] = [];

  if (s?.attendance) {
    const today = s.attendance.today;
    const counted = today.present + today.late + today.absent;
    const diff = today.percentage !== null && s.attendance.yesterday !== null ? Math.round((today.percentage - s.attendance.yesterday) * 10) / 10 : null;
    cards.push(
      <StatCard
        key="attendance"
        label="Attendance today"
        value={today.percentage === null ? "—" : `${today.percentage}%`}
        icon={CalendarCheck}
        tone="emerald"
        href="/app/attendance/reports"
        trend={diff === null ? undefined : { value: diff, unit: " pts", label: "vs yesterday" }}
        hint={counted ? `${today.present + today.late} of ${counted} present` : "No registers taken yet today"}
      >
        <Progress value={today.percentage ?? 0} aria-label="Attendance today" indicatorClassName="bg-success" />
      </StatCard>,
    );
  }
  if (s?.students) {
    cards.push(
      <StatCard
        key="students"
        label="Active students"
        value={s.students.active.toLocaleString("en-IN")}
        icon={UserRound}
        tone="sky"
        href="/app/students"
        hint={`${s.students.admitted_this_month} admitted this month${s.students.on_hold ? ` · ${s.students.on_hold} on hold` : ""}`}
      />,
    );
  }
  if (s?.fees) {
    const now = toPoisha(s.fees.collected_this_month);
    const before = toPoisha(s.fees.collected_last_month_to_date);
    const billed = toPoisha(s.fees.billed_this_month);
    const change = before > 0 ? Math.round(((now - before) * 1000) / before) / 10 : null;
    cards.push(
      <StatCard
        key="fees"
        label="Collected this month"
        value={formatTaka(now)}
        icon={Wallet}
        tone="brand"
        href="/app/fees/reports"
        trend={change === null ? undefined : { value: change, label: "vs last month so far" }}
        hint={billed ? `of ${formatTaka(billed)} billed` : "Nothing billed this month yet"}
      >
        {billed > 0 && <Progress value={Math.min(100, (now * 100) / billed)} aria-label="Collected of billed this month" />}
      </StatCard>,
    );
  }
  if (showPending) {
    const items = attention.data?.items ?? [];
    const critical = items.filter((i) => i.tone === "critical").length;
    cards.push(
      <StatCard
        key="pending"
        label="Pending actions"
        value={attention.isPending ? "…" : String(items.length)}
        icon={ListChecks}
        tone="rose"
        href="#pending-actions"
        hint={attention.isPending ? "Checking…" : items.length ? `${critical} urgent` : "All caught up"}
      />,
    );
  }

  if (!cards.length) return null;
  return <section aria-label="Key figures" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{cards}</section>;
}
