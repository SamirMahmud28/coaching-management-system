"use client";

import { ImageIcon, Loader2, Upload, X } from "lucide-react";
import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ACCEPT_ATTRIBUTE, limitMb, useImageUpload } from "./use-image-upload";

const FRAMES = { LOGO: "size-24", SIGNATURE: "h-16 w-48" } as const;

/** Upload-and-preview for an institute logo or a signature image (transparent PNG works best). */
export function ImageField({
  id,
  value,
  onChange,
  category,
  label,
}: {
  id: string;
  value: string | null;
  onChange: (fileId: string | null) => void;
  category: "LOGO" | "SIGNATURE";
  /** Used for the preview's alt text, e.g. "Institute logo". */
  label: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const { upload, pending, error } = useImageUpload(category);

  async function choose(file: File | undefined) {
    if (input.current) input.current.value = "";
    const fileId = await upload(file);
    if (fileId) onChange(fileId);
  }

  return (
    <div className="flex flex-wrap items-center gap-4">
      <div className={cn("flex shrink-0 items-center justify-center rounded-md border bg-[repeating-conic-gradient(var(--muted)_0_25%,transparent_0_50%)] bg-[length:12px_12px]", FRAMES[category])}>
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element -- authenticated, tenant-scoped bytes
          <img src={`/api/v1/files/${value}`} alt={label} className="max-h-full max-w-full object-contain" />
        ) : (
          <ImageIcon aria-hidden className="size-6 text-muted-foreground" />
        )}
      </div>
      <div className="space-y-2">
        <input ref={input} id={id} type="file" accept={ACCEPT_ATTRIBUTE} className="sr-only" aria-describedby={`${id}-hint`} onChange={(e) => choose(e.target.files?.[0])} />
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => input.current?.click()}>
            {pending ? <Loader2 className="animate-spin" /> : <Upload />} {value ? "Change" : "Upload"}
          </Button>
          {value && (
            <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => onChange(null)}>
              <X /> Remove
            </Button>
          )}
        </div>
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          JPG, PNG or WebP, up to {limitMb(category)} MB.{category === "SIGNATURE" ? " A transparent PNG prints best." : ""}
        </p>
        {error && (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
