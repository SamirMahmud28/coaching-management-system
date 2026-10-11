import type { FieldPath, FieldValues, UseFormReturn } from "react-hook-form";
import { toast } from "sonner";
import { ApiError } from "./api-client";

const snake = (s: string) => s.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

/** Turns any thrown value into a sentence a user can act on. */
export function describeError(err: unknown, fallback = "Something went wrong. Please try again."): string {
  if (!(err instanceof ApiError)) return fallback;
  if (err.code === "CONFLICT_SYSTEM_RECORD") return "This is a default record and can't be changed or deleted.";
  const references = (err.details.references as { type: string; count: number }[] | undefined) ?? [];
  if (references.length > 0) {
    return `${err.message} It's in use: ${references.map((r) => `${r.count} ${r.type}`).join(", ")}. Remove those first.`;
  }
  return err.message || fallback;
}

export function notifyError(err: unknown, fallback?: string) {
  toast.error(describeError(err, fallback));
}

export function notifySuccess(message: string) {
  toast.success(message);
}

/**
 * Runs a form's submit action with consistent feedback: a success toast, a field-level error when the
 * server names the offending field, otherwise an error toast. Resolves true only if the action succeeded,
 * so the caller can decide whether to close its dialog.
 */
export async function submitForm<T extends FieldValues>(
  form: UseFormReturn<T>,
  action: () => Promise<void>,
  options: { success?: string; fieldMap?: Record<string, FieldPath<T>> } = {},
): Promise<boolean> {
  try {
    await action();
    if (options.success) notifySuccess(options.success);
    return true;
  } catch (err) {
    if (err instanceof ApiError) {
      const field = typeof err.details.field === "string" ? err.details.field : undefined;
      const target = field ? (options.fieldMap?.[field] ?? (snake(field) as FieldPath<T>)) : undefined;
      if (target && field && target in form.getValues()) {
        form.setError(target, { type: "server", message: err.message });
        notifyError(err);
        return false;
      }
    }
    notifyError(err);
    return false;
  }
}

/** Runs a non-form action (delete, toggle, assign). A 409 goes to `onBlocked` when given, else it's toasted. */
export async function runAction(
  action: () => Promise<unknown>,
  options: { success?: string; onBlocked?: (error: ApiError) => void } = {},
): Promise<boolean> {
  try {
    await action();
    if (options.success) notifySuccess(options.success);
    return true;
  } catch (err) {
    if (err instanceof ApiError && err.status === 409 && options.onBlocked) options.onBlocked(err);
    else notifyError(err);
    return false;
  }
}
