import { Children, cloneElement, isValidElement } from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/**
 * A labelled form control. `required` puts a red asterisk on the label and marks the control `aria-required`
 * (when the control is the direct child with this `id`), so the field reads as required before anyone submits.
 */
export function FormField({
  id,
  label,
  hint,
  error,
  required,
  className,
  children,
}: {
  id: string;
  label: React.ReactNode;
  hint?: React.ReactNode;
  error?: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const control = required
    ? Children.map(children, (child) =>
        isValidElement<{ id?: string; "aria-required"?: boolean }>(child) && child.props.id === id ? cloneElement(child, { "aria-required": true }) : child,
      )
    : children;
  return (
    <div className={cn("space-y-1.5", className)}>
      {required ? (
        // The asterisk sits beside the label, not in it, so the field's accessible name stays exactly the label.
        <div className="flex items-center gap-1">
          <Label htmlFor={id}>{label}</Label>
          <span aria-hidden className="text-sm leading-none text-destructive">
            *
          </span>
        </div>
      ) : (
        <Label htmlFor={id}>{label}</Label>
      )}
      {control}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : (
        hint && <p className="text-xs text-muted-foreground">{hint}</p>
      )}
    </div>
  );
}
