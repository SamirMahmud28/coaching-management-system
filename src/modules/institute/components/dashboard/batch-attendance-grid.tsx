"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { CalendarCheck } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { SectionCard } from "@/components/shared/section-card";
import { CardSkeleton, EmptyState, ErrorState } from "@/components/shared/states";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import { dashboardApi, type AttendancePeriod } from "../../api";
import { instituteKeys } from "../../keys";
import { BAND_BAR, BAND_LABEL, BAND_TEXT, BAND_TILE, BandLegend, bandOf } from "./bands";

const PERIODS: { value: AttendancePeriod; label: string }[] = [
  { value: "TODAY", label: "Today" },
  { value: "WEEK", label: "7 days" },
  { value: "MONTH", label: "This month" },
];

/** Student attendance by batch, colour-banded with the percentage and band name always written out. */
export function BatchAttendanceGrid() {
  const [period, setPeriod] = useState<AttendancePeriod>("TODAY");
  const query = useQuery({ queryKey: instituteKeys.dashboard("attendance", period), queryFn: () => dashboardApi.attendance(period), placeholderData: keepPreviousData });

  return (
    <SectionCard
      title="Student attendance by batch"
      description={query.data?.overall.percentage != null ? `Overall ${query.data.overall.percentage}%` : "Registers taken in the period"}
      icon={CalendarCheck}
      actions={
        <ToggleGroup type="single" value={period} onValueChange={(v) => v && setPeriod(v as AttendancePeriod)} aria-label="Period">
          {PERIODS.map((p) => (
            <ToggleGroupItem key={p.value} value={p.value} className="h-7 px-2.5 text-xs">
              {p.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      }
    >
      {query.isPending ? (
        <CardSkeleton height={180} className="border-0 p-0 shadow-none" />
      ) : query.error ? (
        <ErrorState onRetry={() => query.refetch()} />
      ) : !query.data.batches.length ? (
        <EmptyState icon={CalendarCheck} title="No batches yet" description="Add a batch with a schedule to see attendance here." />
      ) : (
        <div className="space-y-4">
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 2xl:grid-cols-4">
            {query.data.batches.map((b) => {
              const band = bandOf(b.percentage);
              const counted = b.present + b.late + b.absent;
              return (
                <li key={b.batch_id}>
                  <Link
                    href="/app/attendance/reports"
                    className={cn("block h-full rounded-xl border p-3 transition-all outline-none hover:-translate-y-0.5 hover:shadow-md focus-visible:ring-[3px] focus-visible:ring-ring/50 motion-reduce:hover:translate-y-0", BAND_TILE[band])}
                    aria-label={`${b.batch_name}, ${b.course_name}: ${b.percentage === null ? "no registers yet" : `${b.percentage}%, ${BAND_LABEL[band]}`}`}
                  >
                    <p className="truncate text-xs font-semibold">{b.batch_name}</p>
                    <p className="truncate text-[11px] text-muted-foreground">{b.course_name}</p>
                    <p className={cn("mt-1.5 text-2xl font-bold tabular-nums", BAND_TEXT[band])}>{b.percentage === null ? "—" : `${b.percentage}%`}</p>
                    <p className="text-[11px] text-muted-foreground tabular-nums">{counted ? `${b.present + b.late}/${counted} present` : BAND_LABEL.none}</p>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                      <div className={cn("h-full rounded-full", BAND_BAR[band])} style={{ width: `${b.percentage ?? 0}%` }} />
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
          <BandLegend />
        </div>
      )}
    </SectionCard>
  );
}
