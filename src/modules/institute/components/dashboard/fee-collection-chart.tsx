"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Wallet } from "lucide-react";
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, LabelList, XAxis, YAxis } from "recharts";
import { SectionCard } from "@/components/shared/section-card";
import { CardSkeleton, ErrorState } from "@/components/shared/states";
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { todayInDhaka } from "@/lib/dates";
import { formatTaka, toPoisha } from "@/lib/money";
import { PHONE_QUERY, useMediaQuery } from "@/lib/use-media-query";
import { dashboardApi } from "../../api";
import { instituteKeys } from "../../keys";
import { BAND_FILL, BandLegend, bandOf } from "./bands";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const config: ChartConfig = {
  billed: { label: "Billed", color: "color-mix(in srgb, var(--muted-foreground) 22%, transparent)" },
  collected: { label: "Collected", color: "var(--success)" },
};

/** ৳ in short form for the axis: 2.4L, 85K. */
const shortTaka = (taka: number) => (taka >= 100_000 ? `৳${(taka / 100_000).toFixed(taka >= 1_000_000 ? 0 : 1)}L` : taka >= 1000 ? `৳${Math.round(taka / 1000)}K` : `৳${taka}`);

/**
 * Monthly fee collection against what was billed: the faint bar is the month's charges, the solid bar what was
 * collected, coloured by band and labelled with its percentage so colour is never the only cue.
 */
export function FeeCollectionChart() {
  const thisYear = Number(todayInDhaka().slice(0, 4));
  const [year, setYear] = useState(thisYear);
  const phone = useMediaQuery(PHONE_QUERY);
  const query = useQuery({ queryKey: instituteKeys.dashboard("fees", year), queryFn: () => dashboardApi.fees(year), placeholderData: keepPreviousData });

  const data = (query.data?.months ?? []).map((m, i) => ({
    month: MONTHS[i],
    billed: toPoisha(m.billed) / 100,
    collected: toPoisha(m.collected) / 100,
    percent: m.percent,
  }));
  const totals = query.data?.totals;

  return (
    <SectionCard
      title="Fee collection"
      description="Collected each month against what was billed"
      icon={Wallet}
      actions={
        <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
          <SelectTrigger size="sm" className="w-24" aria-label="Year">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[thisYear, thisYear - 1, thisYear - 2].map((y) => (
              <SelectItem key={y} value={String(y)}>
                {y}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      }
    >
      {query.isPending ? (
        <CardSkeleton height={280} className="border-0 p-0 shadow-none" />
      ) : query.error ? (
        <ErrorState onRetry={() => query.refetch()} />
      ) : (
        <div className="space-y-4">
          {totals && (
            <dl className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
              <div className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-sm bg-success" aria-hidden="true" />
                <dt className="text-muted-foreground">Collected</dt>
                <dd className="font-semibold tabular-nums">{formatTaka(toPoisha(totals.collected))}</dd>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-sm bg-muted-foreground/30" aria-hidden="true" />
                <dt className="text-muted-foreground">Billed</dt>
                <dd className="font-semibold tabular-nums">{formatTaka(toPoisha(totals.billed))}</dd>
              </div>
              {totals.percent !== null && (
                <div className="flex items-center gap-1.5">
                  <dt className="text-muted-foreground">Collected</dt>
                  <dd className="font-semibold tabular-nums">{totals.percent}%</dd>
                </div>
              )}
              {totals.student_months_billed > 0 && (
                <div className="flex items-center gap-1.5">
                  <dt className="text-muted-foreground">Paid in full</dt>
                  <dd className="font-semibold tabular-nums">
                    {totals.students_paid.toLocaleString("en-IN")} / {totals.student_months_billed.toLocaleString("en-IN")} student-months
                  </dd>
                </div>
              )}
            </dl>
          )}
          <ChartContainer config={config} label={`Fee collection by month in ${year}: collected against billed`} className="aspect-auto h-72">
            <BarChart data={data} barGap="-100%" barCategoryGap="22%" margin={{ top: 22, right: 4, left: 4, bottom: 0 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} />
              <YAxis tickLine={false} axisLine={false} width={phone ? 40 : 52} tickFormatter={(v: number) => shortTaka(v)} />
              <ChartTooltip
                cursor={{ fill: "var(--muted)", opacity: 0.4 }}
                formatValue={(v) => formatTaka(Math.round(Number(v) * 100))}
                formatLabel={(l) => {
                  const m = data.find((d) => d.month === l);
                  return m?.percent != null ? `${l} · ${m.percent}% collected` : String(l);
                }}
              />
              <Bar dataKey="billed" name="Billed" fill="var(--color-billed)" radius={[6, 6, 0, 0]} isAnimationActive={false} />
              <Bar dataKey="collected" name="Collected" radius={[6, 6, 0, 0]} isAnimationActive={false}>
                {data.map((d) => (
                  <Cell key={d.month} fill={BAND_FILL[bandOf(d.percent)]} />
                ))}
                {!phone && <LabelList dataKey="percent" position="top" className="fill-muted-foreground text-[10px] font-semibold" formatter={(v: unknown) => (v == null ? "" : `${v}%`)} />}
              </Bar>
            </BarChart>
          </ChartContainer>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <BandLegend />
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="size-2.5 rounded-sm bg-muted-foreground/25" aria-hidden="true" /> Billed (target)
            </span>
          </div>
        </div>
      )}
    </SectionCard>
  );
}
