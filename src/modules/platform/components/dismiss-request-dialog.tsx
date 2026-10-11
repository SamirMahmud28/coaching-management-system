"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { FormField } from "@/components/shared/form-field";
import { Textarea } from "@/components/ui/textarea";
import { platformApi, type ModuleRequestRow } from "../api";
import { platformKeys } from "../keys";

export function DismissRequestDialog({ request, onClose }: { request: ModuleRequestRow | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [note, setNote] = useState("");

  return (
    <ConfirmDialog
      open={request !== null}
      onOpenChange={(open) => {
        if (!open) {
          setNote("");
          onClose();
        }
      }}
      title={request ? `Dismiss ${request.tenant_name}'s request for ${request.module_name}?` : ""}
      description="The institute sees your note in its audit log. Nothing is switched on or off."
      confirmLabel="Dismiss request"
      confirmDisabled={!note.trim()}
      onConfirm={async () => {
        if (!request) return;
        await platformApi.dismissModuleRequest(request.id, note);
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: platformKeys.moduleRequests() }),
          queryClient.invalidateQueries({ queryKey: platformKeys.audit() }),
        ]);
        toast.success("Request dismissed.");
        setNote("");
      }}
    >
      <FormField id="dismiss-note" required label="Note">
        <Textarea id="dismiss-note" value={note} onChange={(e) => setNote(e.target.value)} rows={3} />
      </FormField>
    </ConfirmDialog>
  );
}
