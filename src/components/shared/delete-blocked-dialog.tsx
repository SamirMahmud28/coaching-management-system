"use client";

import { AlertTriangle } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import type { ApiError } from "@/lib/api-client";
import { describeReference } from "@/lib/format";

/** Explains a blocked delete: "why", never a generic error, and offers the non-destructive alternative. */
export function DeleteBlockedDialog({
  error,
  itemName,
  onClose,
  onInstead,
  insteadLabel = "Deactivate instead",
}: {
  error: ApiError | null;
  itemName: string;
  onClose: () => void;
  onInstead?: () => void;
  insteadLabel?: string;
}) {
  if (!error) return null;
  const isSystem = error.code === "CONFLICT_SYSTEM_RECORD";
  const references = (error.details.references as { type: string; count: number }[] | undefined) ?? [];

  return (
    <AlertDialog open onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="size-5 text-destructive" />
            Can&apos;t delete {itemName}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {isSystem
              ? "This is a default record and can't be changed or deleted."
              : references.length > 0
                ? `It's in use: ${references.map((r) => describeReference(r.type, r.count)).join(" · ")}. Remove those first${onInstead ? ", or keep its history and hide it instead" : ""}.`
                : error.message}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          {onInstead && (
            <Button
              variant="outline"
              onClick={() => {
                onInstead();
                onClose();
              }}
            >
              {insteadLabel}
            </Button>
          )}
          <AlertDialogAction onClick={onClose}>OK</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
