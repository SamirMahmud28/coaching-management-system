"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, MoreHorizontal, Pin, Plus } from "lucide-react";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { FormField } from "@/components/shared/form-field";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState, ErrorState, LoadingState } from "@/components/shared/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { todayInDhaka } from "@/lib/dates";
import { runAction, submitForm } from "@/lib/feedback";
import { HowThisWorks } from "@/modules/institute/help/how-this-works";
import { websiteContentApi, type NoticeStatus, type WebsiteNoticeRow } from "../../api";
import { instituteKeys } from "../../keys";
import { WebsiteTabs } from "./website-tabs";

const STATUS: Record<NoticeStatus, { label: string; variant: "success" | "info" | "secondary" | "outline"; hint: string }> = {
  ON_WEBSITE: { label: "On the website", variant: "success", hint: "Visitors see it now." },
  SCHEDULED: { label: "Scheduled", variant: "info", hint: "Appears on its notice date." },
  EXPIRED: { label: "Ended", variant: "secondary", hint: "Its 'show until' date has passed." },
  HIDDEN: { label: "Hidden", variant: "outline", hint: "Taken off the website; click Show again to bring it back." },
};

const formatDate = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/** Public notices on the website (D23, D128): add, edit, pin, hide. */
export function WebsiteNoticesPage() {
  const queryClient = useQueryClient();
  const notices = useQuery({ queryKey: instituteKeys.website("notices"), queryFn: websiteContentApi.notices });
  const [editing, setEditing] = useState<WebsiteNoticeRow | "new" | null>(null);
  const refresh = () => queryClient.invalidateQueries({ queryKey: instituteKeys.website("notices") });

  return (
    <>
      <PageHeader
        title="Website"
        description="Notices on your public website. Saved changes are public at once."
        actions={
          <Button onClick={() => setEditing("new")}>
            <Plus /> Add notice
          </Button>
        }
      />
      <WebsiteTabs />
      <HowThisWorks topic="website-notices" />
      {notices.isPending ? (
        <LoadingState />
      ) : notices.error ? (
        <ErrorState onRetry={() => notices.refetch()} />
      ) : notices.data.items.length === 0 ? (
        <EmptyState title="No notices yet" description="Add admission dates, exam schedules or holiday closures. They appear in the Notices section of your website." />
      ) : (
        <Card>
          <CardContent className="p-0">
            <ul data-testid="notices" className="divide-y">
              {notices.data.items.map((n) => (
                <li key={n.id} data-testid={`notice-${n.title}`} className="flex items-start gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {n.pinned && <Pin aria-label="Pinned" className="size-4 text-primary-strong" />}
                      <span className="font-medium">{n.title}</span>
                      <Badge variant={STATUS[n.status].variant} title={STATUS[n.status].hint}>
                        {STATUS[n.status].label}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(n.notice_date)}
                      {n.show_until && ` · shown until ${formatDate(n.show_until)}`}
                    </p>
                    <p className="line-clamp-2 text-sm text-muted-foreground">{n.body}</p>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" aria-label={`Actions for ${n.title}`}>
                        <MoreHorizontal />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => setEditing(n)}>Edit</DropdownMenuItem>
                      {n.status === "HIDDEN" ? (
                        <DropdownMenuItem onSelect={() => runAction(async () => { await websiteContentApi.showNotice(n.id); await refresh(); }, { success: "Notice shown again." })}>
                          Show again
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem onSelect={() => runAction(async () => { await websiteContentApi.hideNotice(n.id); await refresh(); }, { success: "Notice hidden from the website." })}>
                          Hide from website
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
      {editing && <NoticeDialog editing={editing} onClose={() => setEditing(null)} onSaved={refresh} />}
    </>
  );
}

const schema = z
  .object({
    title: z.string().trim().min(1, "The title is required.").max(150, "At most 150 characters."),
    body: z.string().trim().min(1, "The text is required.").max(5000, "At most 5000 characters."),
    notice_date: z.string().min(1, "Choose the notice date."),
    pinned: z.boolean(),
    show_until: z.string(),
  })
  .refine((v) => !v.show_until || v.show_until >= v.notice_date, { path: ["show_until"], message: "\"Show until\" can't be before the notice date." });
type Values = z.infer<typeof schema>;

function NoticeDialog({ editing, onClose, onSaved }: { editing: WebsiteNoticeRow | "new"; onClose: () => void; onSaved: () => Promise<unknown> }) {
  const today = todayInDhaka();
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues:
      editing === "new"
        ? { title: "", body: "", notice_date: today, pinned: false, show_until: "" }
        : { title: editing.title, body: editing.body, notice_date: editing.notice_date, pinned: editing.pinned, show_until: editing.show_until ?? "" },
  });
  const errors = form.formState.errors;

  async function save(v: Values) {
    const body = { title: v.title.trim(), body: v.body.trim(), notice_date: v.notice_date, pinned: v.pinned, show_until: v.show_until || null };
    const ok = await submitForm(
      form,
      async () => {
        if (editing === "new") await websiteContentApi.createNotice(body);
        else await websiteContentApi.updateNotice(editing.id, body);
        await onSaved();
      },
      { success: editing === "new" ? "Notice added." : "Notice saved.", fieldMap: { noticeDate: "notice_date", showUntil: "show_until" } },
    );
    if (ok) onClose();
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{editing === "new" ? "Add notice" : "Edit notice"}</DialogTitle>
          <DialogDescription>It is public as soon as you save, from its notice date.</DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(save)} className="space-y-4">
          <FormField id="notice-title" required label="Title" error={errors.title?.message}>
            <Input id="notice-title" autoFocus {...form.register("title")} />
          </FormField>
          <FormField id="notice-body" required label="Text" error={errors.body?.message}>
            <Textarea id="notice-body" rows={6} {...form.register("body")} />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id="notice-date" required label="Notice date" hint="Shown on the website from this day." error={errors.notice_date?.message}>
              <Input id="notice-date" type="date" {...form.register("notice_date")} />
            </FormField>
            <FormField id="notice-until" label="Show until" hint="Optional. After this day it leaves the website." error={errors.show_until?.message}>
              <Input id="notice-until" type="date" {...form.register("show_until")} />
            </FormField>
          </div>
          <Controller
            control={form.control}
            name="pinned"
            render={({ field }) => (
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={field.value} onCheckedChange={(v) => field.onChange(v === true)} />
                Pin to the top of the notices
              </label>
            )}
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting && <Loader2 className="animate-spin" />} Save notice
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
