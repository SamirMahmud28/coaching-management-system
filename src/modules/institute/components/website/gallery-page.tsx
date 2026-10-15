"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, ImagePlus, Loader2, Pencil, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { FormField } from "@/components/shared/form-field";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState, ErrorState, LoadingState } from "@/components/shared/states";
import { ACCEPT_ATTRIBUTE, useImageUpload } from "@/components/shared/use-image-upload";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { notifySuccess, runAction } from "@/lib/feedback";
import { HowThisWorks } from "@/modules/institute/help/how-this-works";
import { websiteContentApi, type GalleryPhotoRow } from "../../api";
import { instituteKeys } from "../../keys";
import { WebsiteTabs } from "./website-tabs";

/** The website gallery: up to 60 photos, each with a caption, in the order set. */
export function WebsiteGalleryPage() {
  const queryClient = useQueryClient();
  const gallery = useQuery({ queryKey: instituteKeys.website("gallery"), queryFn: websiteContentApi.gallery });
  const refresh = () => queryClient.invalidateQueries({ queryKey: instituteKeys.website("gallery") });
  const input = useRef<HTMLInputElement>(null);
  const { upload, pending, error } = useImageUpload("WEBSITE_IMAGE");
  const [adding, setAdding] = useState(false);
  const [captioning, setCaptioning] = useState<GalleryPhotoRow | null>(null);
  const [removing, setRemoving] = useState<GalleryPhotoRow | null>(null);

  const items = gallery.data?.items ?? [];
  const limit = gallery.data?.limit ?? 60;
  const full = items.length >= limit;

  async function addFiles(files: File[]) {
    if (input.current) input.current.value = "";
    setAdding(true);
    let added = 0;
    try {
      for (const file of files.slice(0, limit - items.length)) {
        const fileId = await upload(file);
        if (!fileId) break; // the upload hook shows why
        if (!(await runAction(() => websiteContentApi.addPhoto({ file_id: fileId })))) break;
        added++;
      }
    } finally {
      setAdding(false);
      await refresh();
    }
    if (added) notifySuccess(added === 1 ? "Photo added." : `${added} photos added.`);
  }

  const move = (from: number, to: number) => {
    const ids = items.map((p) => p.id);
    [ids[from], ids[to]] = [ids[to], ids[from]];
    return runAction(async () => {
      await websiteContentApi.reorderGallery(ids);
      await refresh();
    });
  };

  return (
    <>
      <PageHeader
        title="Website"
        description="Photos for the Gallery section of your website. Changes are public at once."
        actions={
          <>
            <input ref={input} type="file" multiple accept={ACCEPT_ATTRIBUTE} className="sr-only" aria-label="Choose photos" data-testid="gallery-input" onChange={(e) => addFiles([...(e.target.files ?? [])])} />
            <Button disabled={full || adding || pending || gallery.isPending} onClick={() => input.current?.click()}>
              {adding ? <Loader2 className="animate-spin" /> : <ImagePlus />} Add photos
            </Button>
          </>
        }
      />
      <WebsiteTabs />
      <HowThisWorks topic="website-gallery" />
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {gallery.isPending ? (
        <LoadingState />
      ) : gallery.error ? (
        <ErrorState onRetry={() => gallery.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState icon={ImagePlus} title="No photos yet" description="Add photos of classes, prize-givings and events: JPG, PNG or WebP up to 5 MB each. You can choose several at once." />
      ) : (
        <Card>
          <CardContent className="space-y-4 pt-6">
            <p className="text-sm text-muted-foreground" data-testid="gallery-count">
              {items.length} of {limit} photos{full && " — the gallery is full; remove a photo to add another."}
            </p>
            <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {items.map((p, i) => {
                const name = p.caption ?? `Photo ${i + 1}`;
                return (
                  <li key={p.id} data-testid="gallery-photo" className="space-y-2">
                    {/* eslint-disable-next-line @next/next/no-img-element -- authenticated, tenant-scoped bytes */}
                    <img src={`/api/v1/files/${p.file_id}`} alt={name} className="surface-glass-item aspect-square w-full rounded-md border object-cover" />
                    <p className="truncate text-sm">{p.caption ?? <span className="text-muted-foreground">No caption</span>}</p>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" aria-label={`Move ${name} earlier`} disabled={i === 0} onClick={() => move(i, i - 1)}>
                        <ArrowLeft />
                      </Button>
                      <Button variant="ghost" size="icon" aria-label={`Move ${name} later`} disabled={i === items.length - 1} onClick={() => move(i, i + 1)}>
                        <ArrowRight />
                      </Button>
                      <Button variant="ghost" size="icon" aria-label={`Edit caption of ${name}`} onClick={() => setCaptioning(p)}>
                        <Pencil />
                      </Button>
                      <Button variant="ghost" size="icon" aria-label={`Remove ${name}`} onClick={() => setRemoving(p)}>
                        <Trash2 />
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}
      {captioning && <CaptionDialog photo={captioning} onClose={() => setCaptioning(null)} onSaved={refresh} />}
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title="Remove this photo?"
        description="It leaves the website's gallery straight away."
        confirmLabel="Remove"
        destructive
        onConfirm={async () => {
          if (!removing) return;
          await runAction(async () => {
            await websiteContentApi.removePhoto(removing.id);
            await refresh();
          }, { success: "Photo removed." });
          setRemoving(null);
        }}
      />
    </>
  );
}

function CaptionDialog({ photo, onClose, onSaved }: { photo: GalleryPhotoRow; onClose: () => void; onSaved: () => Promise<unknown> }) {
  const [caption, setCaption] = useState(photo.caption ?? "");
  const [saving, setSaving] = useState(false);
  const tooLong = caption.trim().length > 200;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const ok = await runAction(async () => {
      await websiteContentApi.updatePhoto(photo.id, caption.trim() || null);
      await onSaved();
    }, { success: "Caption saved." });
    setSaving(false);
    if (ok) onClose();
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit caption</DialogTitle>
        </DialogHeader>
        <form onSubmit={save} className="space-y-4">
          {/* eslint-disable-next-line @next/next/no-img-element -- authenticated, tenant-scoped bytes */}
          <img src={`/api/v1/files/${photo.file_id}`} alt="" className="max-h-56 w-full rounded-md object-contain" />
          <FormField id="caption" label="Caption" hint="Optional, e.g. 'Prize-giving 2026'." error={tooLong ? "At most 200 characters." : undefined}>
            <Input id="caption" autoFocus value={caption} onChange={(e) => setCaption(e.target.value)} />
          </FormField>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving || tooLong}>
              {saving && <Loader2 className="animate-spin" />} Save caption
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
