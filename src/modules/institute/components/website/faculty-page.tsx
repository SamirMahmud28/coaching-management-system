"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, GraduationCap, Loader2, MoreHorizontal, Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { FormField } from "@/components/shared/form-field";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState, ErrorState, LoadingState } from "@/components/shared/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { runAction } from "@/lib/feedback";
import { HowThisWorks } from "@/modules/institute/help/how-this-works";
import { websiteContentApi, type FacultyRow } from "../../api";
import { instituteKeys } from "../../keys";
import { WebsiteTabs } from "./website-tabs";

/** Instructors the office shows on the website: opt-in, with name, photo, subjects and a line; never contacts. */
export function WebsiteFacultyPage() {
  const queryClient = useQueryClient();
  const list = useQuery({ queryKey: instituteKeys.website("faculty"), queryFn: websiteContentApi.faculty });
  const refresh = () => queryClient.invalidateQueries({ queryKey: instituteKeys.website("faculty") });
  const [editing, setEditing] = useState<FacultyRow | "new" | null>(null);
  const [removing, setRemoving] = useState<FacultyRow | null>(null);
  const items = list.data?.items ?? [];
  const candidates = list.data?.candidates ?? [];

  const move = (from: number, to: number) => {
    const ids = items.map((f) => f.id);
    [ids[from], ids[to]] = [ids[to], ids[from]];
    return runAction(async () => {
      await websiteContentApi.reorderFaculty(ids);
      await refresh();
    });
  };

  return (
    <>
      <PageHeader
        title="Website"
        description="Instructors you show in the Faculty section, with their photo and subjects. Changes are public at once."
        actions={
          <Button onClick={() => setEditing("new")} disabled={!list.data || candidates.length === 0} title={list.data && candidates.length === 0 ? "Every active instructor is already on the website." : undefined}>
            <Plus /> Add instructor
          </Button>
        }
      />
      <WebsiteTabs />
      <HowThisWorks topic="website-faculty" />
      {list.isPending ? (
        <LoadingState />
      ) : list.error ? (
        <ErrorState onRetry={() => list.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState icon={GraduationCap} title="No instructors on the website yet" description="Add the instructors you'd like visitors to see. Their name, photo and subjects come from Instructors; phone numbers and emails are never shown." />
      ) : (
        <Card>
          <CardContent className="p-0">
            <ol data-testid="faculty" className="divide-y">
              {items.map((f, i) => (
                <li key={f.id} className="flex items-center gap-3 px-4 py-3">
                  {f.photo_file_id ? (
                    // eslint-disable-next-line @next/next/no-img-element -- authenticated, tenant-scoped bytes
                    <img src={`/api/v1/files/${f.photo_file_id}`} alt="" className="size-10 shrink-0 rounded-full object-cover" />
                  ) : (
                    <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted font-medium">
                      {f.name.slice(0, 1).toUpperCase()}
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 font-medium">
                      {f.name}
                      {f.status !== "ACTIVE" && <Badge variant="outline">Inactive: hidden from the website</Badge>}
                      {!f.photo_file_id && <span className="text-xs font-normal text-muted-foreground">No photo yet</span>}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {f.subjects.length ? f.subjects.join(", ") : "No subjects in active batches"}
                      {f.line && ` · ${f.line}`}
                    </p>
                  </div>
                  <Button variant="ghost" size="icon" aria-label={`Move ${f.name} up`} disabled={i === 0} onClick={() => move(i, i - 1)}>
                    <ArrowUp />
                  </Button>
                  <Button variant="ghost" size="icon" aria-label={`Move ${f.name} down`} disabled={i === items.length - 1} onClick={() => move(i, i + 1)}>
                    <ArrowDown />
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" aria-label={`Actions for ${f.name}`}>
                        <MoreHorizontal />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => setEditing(f)}>Edit line</DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link href={`/app/instructors/${f.instructor_id}`}>Change photo (Instructors)</Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem variant="destructive" onSelect={() => setRemoving(f)}>
                        Take off the website
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      )}
      {editing && <FacultyDialog editing={editing} candidates={candidates} onClose={() => setEditing(null)} onSaved={refresh} />}
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={removing ? `Take ${removing.name} off the website?` : ""}
        description="Only the website changes; the instructor and their batches stay as they are."
        confirmLabel="Take off"
        destructive
        onConfirm={async () => {
          if (!removing) return;
          await runAction(async () => {
            await websiteContentApi.removeFaculty(removing.id);
            await refresh();
          }, { success: "Taken off the website." });
          setRemoving(null);
        }}
      />
    </>
  );
}

function FacultyDialog({ editing, candidates, onClose, onSaved }: { editing: FacultyRow | "new"; candidates: { id: string; name: string }[]; onClose: () => void; onSaved: () => Promise<unknown> }) {
  const [instructorId, setInstructorId] = useState(editing === "new" ? "" : editing.instructor_id);
  const [line, setLine] = useState(editing === "new" ? "" : (editing.line ?? ""));
  const [saving, setSaving] = useState(false);
  const tooLong = line.trim().length > 120;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if ((editing === "new" && !instructorId) || tooLong) return;
    setSaving(true);
    const ok = await runAction(
      async () => {
        if (editing === "new") await websiteContentApi.addFaculty({ instructor_id: instructorId, line: line.trim() || null });
        else await websiteContentApi.updateFaculty(editing.id, line.trim() || null);
        await onSaved();
      },
      { success: editing === "new" ? "Instructor added to the website." : "Saved." },
    );
    setSaving(false);
    if (ok) onClose();
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing === "new" ? "Add an instructor to the website" : `Edit ${editing.name}`}</DialogTitle>
        </DialogHeader>
        <form onSubmit={save} className="space-y-4">
          {editing === "new" && (
            <FormField id="f-instructor" required label="Instructor" hint="Active instructors not yet on the website.">
              <Select value={instructorId} onValueChange={setInstructorId}>
                <SelectTrigger id="f-instructor" className="w-full">
                  <SelectValue placeholder="Choose an instructor" />
                </SelectTrigger>
                <SelectContent>
                  {candidates.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
          )}
          <FormField id="f-line" label="Line under the name" hint="Optional, e.g. 'BUET, 8 years teaching'." error={tooLong ? "At most 120 characters." : undefined}>
            <Input id="f-line" value={line} onChange={(e) => setLine(e.target.value)} />
          </FormField>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving || (editing === "new" && !instructorId)}>
              {saving && <Loader2 className="animate-spin" />} {editing === "new" ? "Add to website" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
