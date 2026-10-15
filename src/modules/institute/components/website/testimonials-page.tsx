"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Loader2, MessageSquareQuote, MoreHorizontal, Plus } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { runAction, submitForm } from "@/lib/feedback";
import { HowThisWorks } from "@/modules/institute/help/how-this-works";
import { websiteContentApi, type TestimonialRow } from "../../api";
import { instituteKeys } from "../../keys";
import { WebsiteTabs } from "./website-tabs";

/** Testimonials entered by the office, shown on the website in the order set. */
export function WebsiteTestimonialsPage() {
  const queryClient = useQueryClient();
  const list = useQuery({ queryKey: instituteKeys.website("testimonials"), queryFn: websiteContentApi.testimonials });
  const refresh = () => queryClient.invalidateQueries({ queryKey: instituteKeys.website("testimonials") });
  const [editing, setEditing] = useState<TestimonialRow | "new" | null>(null);
  const [removing, setRemoving] = useState<TestimonialRow | null>(null);
  const items = list.data?.items ?? [];

  const move = (from: number, to: number) => {
    const ids = items.map((t) => t.id);
    [ids[from], ids[to]] = [ids[to], ids[from]];
    return runAction(async () => {
      await websiteContentApi.reorderTestimonials(ids);
      await refresh();
    });
  };

  return (
    <>
      <PageHeader
        title="Website"
        description="What students and guardians say about you, for the Testimonials section. Changes are public at once."
        actions={
          <Button onClick={() => setEditing("new")}>
            <Plus /> Add testimonial
          </Button>
        }
      />
      <WebsiteTabs />
      <HowThisWorks topic="website-testimonials" />
      {list.isPending ? (
        <LoadingState />
      ) : list.error ? (
        <ErrorState onRetry={() => list.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState icon={MessageSquareQuote} title="No testimonials yet" description="Add a few words from successful students or happy guardians, with their permission." />
      ) : (
        <Card>
          <CardContent className="p-0">
            <ol data-testid="testimonials" className="divide-y">
              {items.map((t, i) => (
                <li key={t.id} className="flex items-start gap-3 px-4 py-3">
                  {t.photo_file_id ? (
                    // eslint-disable-next-line @next/next/no-img-element -- authenticated, tenant-scoped bytes
                    <img src={`/api/v1/files/${t.photo_file_id}`} alt="" className="size-10 shrink-0 rounded-full object-cover" />
                  ) : (
                    <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted font-medium">
                      {t.name.slice(0, 1).toUpperCase()}
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">
                      {t.name}
                      {t.line && <span className="font-normal text-muted-foreground"> · {t.line}</span>}
                    </p>
                    <p className="line-clamp-2 text-sm text-muted-foreground">“{t.quote}”</p>
                  </div>
                  <Button variant="ghost" size="icon" aria-label={`Move ${t.name} up`} disabled={i === 0} onClick={() => move(i, i - 1)}>
                    <ArrowUp />
                  </Button>
                  <Button variant="ghost" size="icon" aria-label={`Move ${t.name} down`} disabled={i === items.length - 1} onClick={() => move(i, i + 1)}>
                    <ArrowDown />
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" aria-label={`Actions for ${t.name}`}>
                        <MoreHorizontal />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => setEditing(t)}>Edit</DropdownMenuItem>
                      <DropdownMenuItem variant="destructive" onSelect={() => setRemoving(t)}>
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
      {editing && <TestimonialDialog editing={editing} onClose={() => setEditing(null)} onSaved={refresh} />}
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={removing ? `Remove ${removing.name}'s testimonial?` : ""}
        description="It leaves the website straight away."
        confirmLabel="Remove"
        destructive
        onConfirm={async () => {
          if (!removing) return;
          await runAction(async () => {
            await websiteContentApi.removeTestimonial(removing.id);
            await refresh();
          }, { success: "Testimonial removed." });
          setRemoving(null);
        }}
      />
    </>
  );
}

const schema = z.object({
  quote: z.string().trim().min(1, "The quote is required.").max(600, "At most 600 characters."),
  name: z.string().trim().min(1, "The name is required.").max(100, "At most 100 characters."),
  line: z.string().trim().max(120, "At most 120 characters."),
  photo_file_id: z.string(),
});
type Values = z.infer<typeof schema>;

function TestimonialDialog({ editing, onClose, onSaved }: { editing: TestimonialRow | "new"; onClose: () => void; onSaved: () => Promise<unknown> }) {
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: editing === "new" ? { quote: "", name: "", line: "", photo_file_id: "" } : { quote: editing.quote, name: editing.name, line: editing.line ?? "", photo_file_id: editing.photo_file_id ?? "" },
  });
  const errors = form.formState.errors;

  async function save(v: Values) {
    const body = { quote: v.quote.trim(), name: v.name.trim(), line: v.line.trim() || null, photo_file_id: v.photo_file_id || null };
    const ok = await submitForm(
      form,
      async () => {
        if (editing === "new") await websiteContentApi.createTestimonial(body);
        else await websiteContentApi.updateTestimonial(editing.id, body);
        await onSaved();
      },
      { success: editing === "new" ? "Testimonial added." : "Testimonial saved.", fieldMap: { photoFileId: "photo_file_id" } },
    );
    if (ok) onClose();
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{editing === "new" ? "Add testimonial" : "Edit testimonial"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(save)} className="space-y-4">
          <FormField id="t-quote" required label="What they said" error={errors.quote?.message}>
            <Textarea id="t-quote" rows={4} autoFocus {...form.register("quote")} />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id="t-name" required label="Name" error={errors.name?.message}>
              <Input id="t-name" {...form.register("name")} />
            </FormField>
            <FormField id="t-line" label="Line under the name" hint="Optional, e.g. 'HSC 2025, GPA 5' or 'Guardian'." error={errors.line?.message}>
              <Input id="t-line" {...form.register("line")} />
            </FormField>
          </div>
          <FormField id="t-photo" label="Photo" hint="Optional. Only with the person's permission.">
            <Controller control={form.control} name="photo_file_id" render={({ field }) => (
              <ImageField id="t-photo" category="WEBSITE_IMAGE" label="Testimonial photo" value={field.value || null} onChange={(id) => field.onChange(id ?? "")} />
            )} />
          </FormField>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting && <Loader2 className="animate-spin" />} Save testimonial
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
