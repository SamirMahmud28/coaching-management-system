"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, MoreHorizontal, Phone, UserPlus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { FormField } from "@/components/shared/form-field";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState, ErrorState, LoadingState } from "@/components/shared/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { runAction } from "@/lib/feedback";
import { cn } from "@/lib/utils";
import { HowThisWorks } from "@/modules/institute/help/how-this-works";
import { enquiriesApi, type EnquiryRow, type EnquiryStatus } from "../../api";
import { instituteKeys } from "../../keys";
import { WebsiteTabs } from "./website-tabs";

const STATUS: Record<EnquiryStatus, { label: string; variant: "info" | "warning" | "success" | "secondary" }> = {
  NEW: { label: "New", variant: "info" },
  CONTACTED: { label: "Contacted", variant: "warning" },
  CONVERTED: { label: "Converted", variant: "success" },
  CLOSED: { label: "Closed", variant: "secondary" },
};
const FILTERS: (EnquiryStatus | "ALL")[] = ["ALL", "NEW", "CONTACTED", "CONVERTED", "CLOSED"];

const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Dhaka" });

/** The admission enquiry inbox: New → Contacted → Converted or Closed, with a note. */
export function EnquiriesPage({ canAdmit }: { canAdmit: boolean }) {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<EnquiryStatus | "ALL">("NEW");
  const list = useQuery({ queryKey: instituteKeys.website("enquiries", filter), queryFn: () => enquiriesApi.list(filter === "ALL" ? undefined : filter) });
  const [noting, setNoting] = useState<EnquiryRow | null>(null);
  const refresh = () => queryClient.invalidateQueries({ queryKey: instituteKeys.website("enquiries") });
  const counts = list.data?.counts;
  const total = counts ? Object.values(counts).reduce((a, b) => a + b, 0) : 0;

  const setStatus = (e: EnquiryRow, status: EnquiryStatus, success: string) =>
    runAction(async () => {
      await enquiriesApi.update(e.id, { status });
      await refresh();
    }, { success });

  return (
    <>
      <PageHeader title="Website" description="Admission enquiries sent from your website's form. Call back, note what happened, and admit the student." />
      <WebsiteTabs />
      <HowThisWorks topic="website-enquiries" />
      <div role="tablist" aria-label="Filter by status" className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Button key={f} role="tab" aria-selected={filter === f} variant={filter === f ? "default" : "outline"} size="sm" onClick={() => setFilter(f)}>
            {f === "ALL" ? "All" : STATUS[f].label}
            {counts && <span className="ml-1 tabular-nums opacity-70">{f === "ALL" ? total : counts[f]}</span>}
          </Button>
        ))}
      </div>
      {list.isPending ? (
        <LoadingState />
      ) : list.error ? (
        <ErrorState onRetry={() => list.refetch()} />
      ) : list.data.items.length === 0 ? (
        <EmptyState title={filter === "NEW" ? "No new enquiries" : "Nothing here"} description="Enquiries arrive from the Admission enquiry section of your website. Make sure that section is switched on under Design." />
      ) : (
        <Card>
          <CardContent className="p-0">
            <ul data-testid="enquiries" className="divide-y">
              {list.data.items.map((e) => (
                <li key={e.id} data-testid={`enquiry-${e.name}`} className="flex flex-wrap items-start gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{e.name}</span>
                      <Badge variant={STATUS[e.status].variant}>{STATUS[e.status].label}</Badge>
                      <span className="text-xs text-muted-foreground">{when(e.created_at)}</span>
                    </div>
                    <p className="flex flex-wrap items-center gap-x-3 text-sm">
                      <a href={`tel:${e.mobile}`} className="inline-flex items-center gap-1 hover:underline">
                        <Phone aria-hidden className="size-3.5" /> {e.mobile}
                      </a>
                      {e.course_name && <span className="text-muted-foreground">Course: {e.course_name}</span>}
                    </p>
                    {e.message && <p className="whitespace-pre-line text-sm text-muted-foreground">“{e.message}”</p>}
                    {e.note && <p className="text-sm"><span className="text-muted-foreground">Note: </span>{e.note}</p>}
                    {e.status === "CONVERTED" && e.student_id && (
                      <p className="text-sm">
                        Admitted as{" "}
                        <Link href={`/app/students/${e.student_id}`} className="font-mono underline">
                          {e.student_code}
                        </Link>
                      </p>
                    )}
                  </div>
                  {canAdmit && (e.status === "NEW" || e.status === "CONTACTED") && (
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/app/students/new?enquiry=${e.id}`}>
                        <UserPlus /> Convert
                      </Link>
                    </Button>
                  )}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" aria-label={`Actions for ${e.name}`}>
                        <MoreHorizontal />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {e.status === "NEW" && <DropdownMenuItem onSelect={() => setStatus(e, "CONTACTED", "Marked as contacted.")}>Mark as contacted</DropdownMenuItem>}
                      {e.status === "CONTACTED" && <DropdownMenuItem onSelect={() => setStatus(e, "NEW", "Moved back to New.")}>Back to New</DropdownMenuItem>}
                      {(e.status === "NEW" || e.status === "CONTACTED") && <DropdownMenuItem onSelect={() => setStatus(e, "CLOSED", "Enquiry closed.")}>Close</DropdownMenuItem>}
                      {e.status === "CLOSED" && <DropdownMenuItem onSelect={() => setStatus(e, "NEW", "Enquiry reopened.")}>Reopen</DropdownMenuItem>}
                      <DropdownMenuItem onSelect={() => setNoting(e)}>{e.note ? "Edit note" : "Add note"}</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
      {noting && <NoteDialog enquiry={noting} onClose={() => setNoting(null)} onSaved={refresh} />}
    </>
  );
}

function NoteDialog({ enquiry, onClose, onSaved }: { enquiry: EnquiryRow; onClose: () => void; onSaved: () => Promise<unknown> }) {
  const [note, setNote] = useState(enquiry.note ?? "");
  const [saving, setSaving] = useState(false);
  const tooLong = note.trim().length > 500;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const ok = await runAction(async () => {
      await enquiriesApi.update(enquiry.id, { note: note.trim() || null });
      await onSaved();
    }, { success: "Note saved." });
    setSaving(false);
    if (ok) onClose();
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Note for {enquiry.name}</DialogTitle>
        </DialogHeader>
        <form onSubmit={save} className="space-y-4">
          <FormField id="enquiry-note" label="Note" hint="e.g. 'Called; visiting on Saturday with the guardian.'" error={tooLong ? "At most 500 characters." : undefined}>
            <Textarea id="enquiry-note" rows={4} autoFocus value={note} onChange={(e) => setNote(e.target.value)} className={cn(tooLong && "border-destructive")} />
          </FormField>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving || tooLong}>
              {saving && <Loader2 className="animate-spin" />} Save note
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
