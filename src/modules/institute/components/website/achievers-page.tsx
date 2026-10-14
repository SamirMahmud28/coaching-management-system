"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Loader2, MoreHorizontal, Plus, Trophy } from "lucide-react";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { FormField } from "@/components/shared/form-field";
import { ImageField } from "@/components/shared/image-field";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState, ErrorState, LoadingState } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { runAction, submitForm } from "@/lib/feedback";
import { HowThisWorks } from "@/modules/institute/help/how-this-works";
import { websiteContentApi, type AchieverRow } from "../../api";
import { instituteKeys } from "../../keys";
import { WebsiteTabs } from "./website-tabs";

/** Top results typed in by the office (D141), shown in the Achievers section in the order set. */
export function WebsiteAchieversPage() {
  const queryClient = useQueryClient();
  const list = useQuery({ queryKey: instituteKeys.website("achievers"), queryFn: websiteContentApi.achievers });
  const refresh = () => queryClient.invalidateQueries({ queryKey: instituteKeys.website("achievers") });
  const [editing, setEditing] = useState<AchieverRow | "new" | null>(null);
  const [removing, setRemoving] = useState<AchieverRow | null>(null);
  const items = list.data?.items ?? [];
  const full = !!list.data && items.length >= list.data.limit;

  const move = (from: number, to: number) => {
    const ids = items.map((a) => a.id);
    [ids[from], ids[to]] = [ids[to], ids[from]];
    return runAction(async () => {
      await websiteContentApi.reorderAchievers(ids);
      await refresh();
    });
  };

  return (
    <>
      <PageHeader
        title="Website"
        description="Your top results for the Achievers section, e.g. GPA 5 holders. Changes are public at once."
        actions={
          <Button onClick={() => setEditing("new")} disabled={full} title={full ? "The list is full. Remove one to add another." : undefined}>
            <Plus /> Add achiever
          </Button>
        }
      />
      <WebsiteTabs />
      <HowThisWorks topic="website-achievers" />
      {list.isPending ? (
        <LoadingState />
      ) : list.error ? (
        <ErrorState onRetry={() => list.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState icon={Trophy} title="No achievers yet" description="Add students who made you proud, with their result, e.g. 'GPA 5.00' in 'SSC 2025'. Ask their permission first." />
      ) : (
        <Card>
          <CardContent className="p-0">
            <p className="border-b px-4 py-2 text-sm text-muted-foreground">
              {items.length} of {list.data.limit}
            </p>
            <ol data-testid="achievers" className="divide-y">
              {items.map((a, i) => (
                <li key={a.id} className="flex items-center gap-3 px-4 py-3">
                  {a.photo_file_id ? (
                    // eslint-disable-next-line @next/next/no-img-element -- authenticated, tenant-scoped bytes
                    <img src={`/api/v1/files/${a.photo_file_id}`} alt="" className="size-10 shrink-0 rounded-full object-cover" />
                  ) : (
                    <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted font-medium">
                      {a.name.slice(0, 1).toUpperCase()}
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{a.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {a.result}
                      {a.exam && ` · ${a.exam}`}
                    </p>
                  </div>
                  <Button variant="ghost" size="icon" aria-label={`Move ${a.name} up`} disabled={i === 0} onClick={() => move(i, i - 1)}>
                    <ArrowUp />
                  </Button>
                  <Button variant="ghost" size="icon" aria-label={`Move ${a.name} down`} disabled={i === items.length - 1} onClick={() => move(i, i + 1)}>
                    <ArrowDown />
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" aria-label={`Actions for ${a.name}`}>
                        <MoreHorizontal />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => setEditing(a)}>Edit</DropdownMenuItem>
                      <DropdownMenuItem variant="destructive" onSelect={() => setRemoving(a)}>
                        Remove
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      )}
      {editing && <AchieverDialog editing={editing} onClose={() => setEditing(null)} onSaved={refresh} />}
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={removing ? `Remove ${removing.name}?` : ""}
        description="They leave the website straight away."
        confirmLabel="Remove"
        destructive
        onConfirm={async () => {
          if (!removing) return;
          await runAction(async () => {
            await websiteContentApi.removeAchiever(removing.id);
            await refresh();
          }, { success: "Achiever removed." });
          setRemoving(null);
        }}
      />
    </>
  );
}

const schema = z.object({
  name: z.string().trim().min(1, "The name is required.").max(100, "At most 100 characters."),
  result: z.string().trim().min(1, "The result is required.").max(80, "At most 80 characters."),
  exam: z.string().trim().max(40, "At most 40 characters."),
  photo_file_id: z.string(),
});
type Values = z.infer<typeof schema>;

function AchieverDialog({ editing, onClose, onSaved }: { editing: AchieverRow | "new"; onClose: () => void; onSaved: () => Promise<unknown> }) {
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: editing === "new" ? { name: "", result: "", exam: "", photo_file_id: "" } : { name: editing.name, result: editing.result, exam: editing.exam ?? "", photo_file_id: editing.photo_file_id ?? "" },
  });
  const errors = form.formState.errors;

  async function save(v: Values) {
    const body = { name: v.name.trim(), result: v.result.trim(), exam: v.exam.trim() || null, photo_file_id: v.photo_file_id || null };
    const ok = await submitForm(
      form,
      async () => {
        if (editing === "new") await websiteContentApi.createAchiever(body);
        else await websiteContentApi.updateAchiever(editing.id, body);
        await onSaved();
      },
      { success: editing === "new" ? "Achiever added." : "Achiever saved.", fieldMap: { photoFileId: "photo_file_id" } },
    );
    if (ok) onClose();
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{editing === "new" ? "Add achiever" : "Edit achiever"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(save)} className="space-y-4">
          <FormField id="a-name" required label="Student's name" error={errors.name?.message}>
            <Input id="a-name" autoFocus {...form.register("name")} />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id="a-result" required label="Result" hint="e.g. 'GPA 5.00' or 'Merit position 12'." error={errors.result?.message}>
              <Input id="a-result" {...form.register("result")} />
            </FormField>
            <FormField id="a-exam" label="Exam" hint="Optional, e.g. 'SSC 2025'." error={errors.exam?.message}>
              <Input id="a-exam" {...form.register("exam")} />
            </FormField>
          </div>
          <FormField id="a-photo" label="Photo" hint="Optional. Only with the student's (or guardian's) permission.">
            <Controller control={form.control} name="photo_file_id" render={({ field }) => (
              <ImageField id="a-photo" category="WEBSITE_IMAGE" label="Achiever photo" value={field.value || null} onChange={(id) => field.onChange(id ?? "")} />
            )} />
          </FormField>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting && <Loader2 className="animate-spin" />} Save achiever
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
