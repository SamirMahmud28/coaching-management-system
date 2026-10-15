import Link from "next/link";
import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

export type StatTone = "brand" | "sky" | "violet" | "emerald" | "rose";

const TONES: Record<StatTone, string> = {
  brand: "bg-accent text-primary-strong",
  sky: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
  violet: "bg-violet-500/10 text-violet-700 dark:text-violet-300",
  emerald: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  rose: "bg-rose-500/10 text-rose-700 dark:text-rose-300",
};

/**
 * A KPI card (D152): a label, a big number, an optional trend (up is good unless `trendGoodWhen` says otherwise), an
 * optional hint line and an optional extra (e.g. a progress bar). With `href`, the whole card links to the detail page.
 */
export function StatCard({
  label,
  value,
  icon: Icon,
  tone = "brand",
  hint,
  trend,
  href,
  children,
  className,
}: {
  label: string;
  value: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  tone?: StatTone;
  hint?: React.ReactNode;
  /** Change against the previous period, e.g. { value: 12, label: "vs last month", goodWhen: "up" } shows "+12%". */
  trend?: { value: number; label?: string; goodWhen?: "up" | "down"; unit?: string };
  href?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  const up = trend && trend.value > 0;
  const flat = trend && trend.value === 0;
  const good = trend && !flat && (trend.goodWhen === "down" ? !up : up);
  const TrendIcon = flat ? ArrowRight : up ? ArrowUpRight : ArrowDownRight;

  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        {Icon && (
          <span className={cn("grid size-9 shrink-0 place-items-center rounded-xl", TONES[tone])} aria-hidden="true">
            <Icon className="size-[18px]" />
          </span>
        )}
      </div>
      <p className="mt-2 text-metric tabular-nums">{value}</p>
      {(trend || hint) && (
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          {trend && (
            <span
              className={cn(
                "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-semibold tabular-nums",
                flat ? "bg-muted text-muted-foreground" : good ? "bg-success/12 text-emerald-700 dark:text-emerald-300" : "bg-destructive/10 text-red-700 dark:text-red-300",
              )}
            >
              <TrendIcon className="size-3.5" aria-hidden="true" />
              {`${trend.value > 0 ? "+" : ""}${trend.value}${trend.unit ?? "%"}`}
            </span>
          )}
          {trend?.label && <span className="text-muted-foreground">{trend.label}</span>}
          {hint && <span className="text-muted-foreground">{hint}</span>}
        </div>
      )}
      {children && <div className="mt-3">{children}</div>}
    </>
  );

  const base = "surface-glass relative block rounded-2xl border p-5 text-card-foreground";
  if (href) {
    return (
      <Link
        href={href}
        className={cn(
          base,
          "group outline-none transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md focus-visible:ring-[3px] focus-visible:ring-ring/50 motion-reduce:hover:translate-y-0",
          className,
        )}
      >
        {body}
      </Link>
    );
  }
  return <div className={cn(base, className)}>{body}</div>;
}
