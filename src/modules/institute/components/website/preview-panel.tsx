"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Monitor, Smartphone, Tablet, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { SITE_LABELS } from "@/modules/website/i18n";
import type { PreviewMessage } from "@/modules/website/components/website-preview";
import { SITE_PAGES, type SitePage } from "@/server/modules/website/design";

// The editor's live preview: the real website in a frame beside the controls, redrawn with the unsaved values
// as they change. Phone, tablet or desktop width, scaled to fit; a page picker; nothing is saved from here.

const DEVICES = [
  { key: "phone", label: "Phone", width: 390, icon: Smartphone },
  { key: "tablet", label: "Tablet", width: 820, icon: Tablet },
  { key: "desktop", label: "Desktop", width: 1280, icon: Monitor },
] as const;

export function PreviewPanel({ settings, onClose, className }: { settings: PreviewMessage["settings"]; onClose: () => void; className?: string }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [device, setDevice] = useState<(typeof DEVICES)[number]["key"]>("desktop");
  const [page, setPage] = useState<SitePage>("home");
  const [ready, setReady] = useState(false);
  const [size, setSize] = useState({ width: 600, height: 600 });
  const width = DEVICES.find((d) => d.key === device)!.width;
  const scale = Math.min(1, size.width / width);

  // The frame says when it is ready, and which page a visitor clicked through to.
  useEffect(() => {
    const fromFrame = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.source !== frame.current?.contentWindow) return;
      if (e.data?.type === "website-preview-ready") setReady(true);
      if (e.data?.type === "website-preview-page" && (SITE_PAGES as readonly string[]).includes(e.data.page)) setPage(e.data.page);
    };
    window.addEventListener("message", fromFrame);
    return () => window.removeEventListener("message", fromFrame);
  }, []);

  // Send the unsaved settings, a moment after the last change.
  useEffect(() => {
    if (!ready) return;
    const timer = setTimeout(() => {
      const message: PreviewMessage = { type: "website-preview", settings, page };
      frame.current?.contentWindow?.postMessage(message, window.location.origin);
    }, 120);
    return () => clearTimeout(timer);
  }, [ready, settings, page]);

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setSize({ width: entry.contentRect.width, height: entry.contentRect.height }));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const labels = SITE_LABELS.EN.page;
  return (
    <section aria-label="Live preview" className={cn("flex min-h-0 flex-col gap-2 rounded-lg border bg-muted/30 p-2", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">Preview</span>
        <span className="text-xs text-muted-foreground">Unsaved changes show here; visitors see them after you save.</span>
        <div className="ml-auto flex items-center gap-1">
          <Select value={page} onValueChange={(v) => setPage(v as SitePage)}>
            <SelectTrigger aria-label="Preview page" className="h-8 w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SITE_PAGES.map((p) => (
                <SelectItem key={p} value={p}>
                  {labels[p]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div role="radiogroup" aria-label="Preview width" className="flex rounded-md border bg-background">
            {DEVICES.map((d) => (
              <button
                key={d.key}
                type="button"
                role="radio"
                aria-checked={device === d.key}
                aria-label={d.label}
                title={d.label}
                onClick={() => setDevice(d.key)}
                className={cn("flex size-8 items-center justify-center", device === d.key ? "bg-primary/10 text-foreground" : "text-muted-foreground hover:text-foreground")}
              >
                <d.icon aria-hidden className="size-4" />
              </button>
            ))}
          </div>
          <Button type="button" variant="ghost" size="icon" aria-label="Close preview" onClick={onClose}>
            <X />
          </Button>
        </div>
      </div>
      <div ref={box} className="relative min-h-0 flex-1 overflow-hidden rounded-md border bg-background">
        <iframe
          ref={frame}
          title="Website preview"
          src="/app/website-preview"
          className="absolute top-0 left-1/2 origin-top border-0"
          style={{ width, height: size.height / scale, transform: `translateX(-50%) scale(${scale})` }}
        />
      </div>
    </section>
  );
}
