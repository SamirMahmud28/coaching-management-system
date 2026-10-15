import { AlertTriangle, Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * An empty list or page: a small illustration (the icon on layered amber rings with a few sparkles), a title, an
 * optional line saying what to do, and an optional action such as "Admit a student".
 */
export function EmptyState({
  title,
  description,
  action,
  icon: Icon = Inbox,
  className,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "surface-glass flex flex-col items-center justify-center gap-4 rounded-2xl border border-dashed px-6 py-12 text-center",
        className,
      )}
    >
      <div className="relative" aria-hidden="true">
        <svg viewBox="0 0 120 120" className="size-28">
          <circle cx="60" cy="60" r="56" className="fill-accent/60" />
          <circle cx="60" cy="60" r="40" className="fill-accent" />
          <path d="M18 30l3-7 3 7 7 3-7 3-3 7-3-7-7-3z" className="fill-primary/70" />
          <path d="M98 84l2-5 2 5 5 2-5 2-2 5-2-5-5-2z" className="fill-primary/50" />
          <circle cx="100" cy="28" r="3" className="fill-chart-2/50" />
          <circle cx="22" cy="92" r="2.5" className="fill-chart-3/50" />
        </svg>
        <div className="absolute inset-0 grid place-items-center">
          <div className="grid size-14 place-items-center rounded-2xl bg-card shadow-md ring-1 ring-border">
            <Icon className="size-7 text-primary-strong" />
          </div>
        </div>
      </div>
      <div className="max-w-sm space-y-1">
        <p className="text-base font-semibold">{title}</p>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function ErrorState({
  message = "Something went wrong while loading this.",
  onRetry,
  className,
}: {
  message?: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn("flex flex-col items-center justify-center gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 px-6 py-10 text-center", className)}
    >
      <div className="grid size-12 place-items-center rounded-full bg-destructive/10">
        <AlertTriangle className="size-6 text-destructive" />
      </div>
      <p className="max-w-sm text-sm">{message}</p>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  );
}

/** A table-shaped placeholder while a list loads: a header strip and rows with a round avatar and text bars. */
export function LoadingState({ rows = 5, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("surface-glass-dense overflow-hidden rounded-xl border", className)} aria-busy="true" aria-label="Loading">
      <div className="flex gap-6 border-b bg-muted/50 px-4 py-3">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-3 w-16" />
        <Skeleton className="ml-auto h-3 w-12" />
      </div>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3 border-b px-4 py-3 last:border-b-0">
          <Skeleton className="size-8 rounded-full" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3.5" style={{ width: `${45 - (i % 3) * 8}%` }} />
            <Skeleton className="h-3 w-1/4" />
          </div>
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
      ))}
    </div>
  );
}

/** Placeholder for a row of KPI cards. */
export function StatCardsSkeleton({ count = 4, className }: { count?: number; className?: string }) {
  return (
    <div className={cn("grid gap-4 sm:grid-cols-2 xl:grid-cols-4", className)} aria-busy="true" aria-label="Loading">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="surface-glass space-y-3 rounded-2xl border p-5">
          <div className="flex items-center justify-between">
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="size-9 rounded-xl" />
          </div>
          <Skeleton className="h-8 w-20" />
          <Skeleton className="h-3 w-32" />
        </div>
      ))}
    </div>
  );
}

/** Placeholder for a card with a heading and a block of content (a chart, a form or a short list). */
export function CardSkeleton({ height = 220, className }: { height?: number; className?: string }) {
  return (
    <div className={cn("surface-glass space-y-4 rounded-2xl border p-5", className)} aria-busy="true" aria-label="Loading">
      <Skeleton className="h-4 w-40" />
      <Skeleton className="w-full rounded-xl" style={{ height }} />
    </div>
  );
}
