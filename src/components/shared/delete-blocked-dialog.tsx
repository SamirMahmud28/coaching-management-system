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

/** Explains a blocked delete (ACADEMIC-LOGIC.md §2.4): "why", never a generic error. */
export function DeleteBlockedDialog({
  error,
  itemName,
  onClose,
  onDeactivateInstead,
}: {
  error: ApiError | null;
  itemName: string;
  onClose: () => void;
  onDeactivateInstead?: () => void;
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
                ? `This is in use: ${references.map((r) => `${r.count} ${r.type}`).join(" · ")}. Remove those first.`
                : error.message}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          {onDeactivateInstead && (
            <Button variant="outline" onClick={onDeactivateInstead}>
              Deactivate instead
            </Button>
          )}
          <AlertDialogAction onClick={onClose}>OK</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
