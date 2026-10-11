"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { DataTable, type Column } from "@/components/shared/data-table";
import { FormField } from "@/components/shared/form-field";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { instituteApi, type InstituteModuleStatus } from "../api";
import { instituteKeys } from "../keys";

export function InstituteModulesPage() {
  const queryClient = useQueryClient();
  const [requesting, setRequesting] = useState<InstituteModuleStatus | null>(null);
  const [note, setNote] = useState("");
  const query = useQuery({ queryKey: instituteKeys.modules(), queryFn: instituteApi.listModules });

  const columns: Column<InstituteModuleStatus>[] = [
    { key: "name", header: "Module", cell: (m) => <span className="font-medium">{m.name}</span> },
    {
      key: "status",
      header: "Status",
      cell: (m) => <StatusBadge status={m.enabled ? "ENABLED" : "DISABLED"} />,
    },
    {
      key: "actions",
      header: <span className="sr-only">Actions</span>,
      className: "text-right",
      cell: (m) =>
        !m.enabled && (
          <Button size="sm" variant="outline" disabled={m.pending_request} onClick={() => setRequesting(m)}>
            {m.pending_request ? "Requested" : "Request module"}
          </Button>
        ),
    },
  ];

  return (
    <>
      <PageHeader title="Modules" description="What your institute currently has access to." />
      <DataTable columns={columns} rows={query.data?.items} getRowId={(m) => m.key} isLoading={query.isPending} error={query.error} onRetry={() => query.refetch()} />

      <ConfirmDialog
        open={requesting !== null}
        onOpenChange={(open) => {
          if (!open) {
            setRequesting(null);
            setNote("");
          }
        }}
        title={requesting ? `Request ${requesting.name}?` : ""}
        description="This sends a request to Neo Nexor — it doesn't switch the module on by itself."
        confirmLabel="Send request"
        onConfirm={async () => {
          if (!requesting) return;
          await instituteApi.requestModule(requesting.key, note.trim() || undefined);
          await queryClient.invalidateQueries({ queryKey: instituteKeys.modules() });
          toast.success("Request sent.");
          setNote("");
        }}
      >
        <FormField id="module-note" label="Note (optional)">
          <Textarea id="module-note" value={note} onChange={(e) => setNote(e.target.value)} rows={3} />
        </FormField>
      </ConfirmDialog>
    </>
  );
}
