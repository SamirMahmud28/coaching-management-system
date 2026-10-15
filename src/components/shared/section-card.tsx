import { cn } from "@/lib/utils";

/**
 * A titled block on a page (a dashboard widget, a profile tab section, a settings group): a heading with an optional
 * icon, description and actions, then the content. Lighter than Card's sub-components for the common case.
 */
export function SectionCard({
  title,
  description,
  icon: Icon,
  actions,
  children,
  className,
  contentClassName,
  as: Heading = "h2",
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
  as?: "h2" | "h3";
}) {
  return (
    <section className={cn("surface-glass rounded-2xl border text-card-foreground", className)}>
      <header className="flex flex-wrap items-start justify-between gap-3 px-5 pt-5">
        <div className="flex min-w-0 items-start gap-3">
          {Icon && (
            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-accent text-primary-strong" aria-hidden="true">
              <Icon className="size-4" />
            </span>
          )}
          <div className="min-w-0 space-y-0.5">
            <Heading className="text-heading">{title}</Heading>
            {description && <p className="text-sm text-muted-foreground">{description}</p>}
          </div>
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </header>
      <div className={cn("p-5", contentClassName)}>{children}</div>
    </section>
  );
}
