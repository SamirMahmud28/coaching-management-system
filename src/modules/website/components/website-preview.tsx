"use client";

import { useEffect, useState } from "react";
import { SITE_PAGES, type SitePage } from "@/server/modules/website/design";
import { InstituteWebsite } from "./institute-website";
import type { Site } from "./sections/shared";

// The website as the editor's live preview shows it (D144). The editor (the parent window, same origin only) sends the
// unsaved settings and the page to show; this redraws at once. Nothing here is saved, and nothing can be sent: links
// between pages switch the preview's page, other links do nothing, and forms don't submit.

export type PreviewMessage = { type: "website-preview"; settings: Site["settings"]; page: SitePage };

const PAGE_PATH = /^\/([a-z]*)(?:#.*)?$/;

export function WebsitePreview({ site }: { site: Site }) {
  const [settings, setSettings] = useState(site.settings);
  const [page, setPage] = useState<SitePage>("home");

  useEffect(() => {
    const fromEditor = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.source !== window.parent) return;
      const data = e.data as PreviewMessage | null;
      if (data?.type !== "website-preview") return;
      setSettings(data.settings);
      if ((SITE_PAGES as readonly string[]).includes(data.page)) setPage(data.page);
    };
    window.addEventListener("message", fromEditor);
    window.parent.postMessage({ type: "website-preview-ready" }, window.location.origin);

    // Keep the visitor's clicks inside the preview.
    const onClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement).closest("a");
      if (!a) return;
      const href = a.getAttribute("href") ?? "";
      if (href.startsWith("#")) return; // in-page links scroll as usual
      e.preventDefault();
      const match = PAGE_PATH.exec(href);
      const next = match ? (match[1] === "" ? "home" : match[1]) : null;
      if (next && (SITE_PAGES as readonly string[]).includes(next)) {
        setPage(next as SitePage);
        window.parent.postMessage({ type: "website-preview-page", page: next }, window.location.origin);
        window.scrollTo({ top: 0 });
      }
    };
    // Stopped before React sees it, so the enquiry form never sends from the preview.
    const noSubmit = (e: SubmitEvent) => {
      e.preventDefault();
      e.stopPropagation();
    };
    document.addEventListener("click", onClick, true);
    document.addEventListener("submit", noSubmit, true);
    return () => {
      window.removeEventListener("message", fromEditor);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("submit", noSubmit, true);
    };
  }, []);

  return <InstituteWebsite key={page} site={{ ...site, settings }} page={page} />;
}
