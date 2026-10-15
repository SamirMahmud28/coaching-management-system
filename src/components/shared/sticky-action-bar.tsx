import { cn } from "@/lib/utils";

/**
 * A frosted bar that stays at the bottom of the screen while a long form is scrolled (a register, a mark sheet, fee
 * collection), so the summary and the Save button are always in reach. It sits in the page flow (sticky), so it
 * never covers the last rows: they scroll up above it. `--app-bottom-inset` lifts it above the phone tab bar.
 */
export function StickyActionBar({
  summary,
  children,
  className,
  label = "Actions",
}: {
  /** Left side: counts or a running total, announced politely when it changes. */
  summary?: React.ReactNode;
  /** Right side: the buttons, primary last. */
  children: React.ReactNode;
  className?: string;
  label?: string;
}) {
  return (
    <div
      role="region"
      aria-label={label}
      className={cn(
        "glass sticky bottom-[calc(var(--app-bottom-inset,0px)+0.75rem)] z-20 mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-4 py-3 shadow-lg",
        className,
      )}
    >
      <div className="min-w-0 text-sm" aria-live="polite">
        {summary}
      </div>
      <div className="ml-auto flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}
