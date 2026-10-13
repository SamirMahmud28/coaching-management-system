"use client";

import { useSyncExternalStore, useState } from "react";
import { Megaphone, X } from "lucide-react";

// The strip at the top of the website (D138): one line from the office, an optional link, and a close button. Closing
// hides this announcement for the rest of the visit; a new announcement shows again.

const storageKey = (text: string) => `site-announcement:${text.length}:${text.slice(0, 40)}`;

function wasClosed(key: string): boolean {
  try {
    return sessionStorage.getItem(key) === "closed";
  } catch {
    return false;
  }
}

const noSubscribe = () => () => {};

export function AnnouncementBar({ text, linkUrl, linkLabel, closeLabel, moreLabel }: { text: string; linkUrl: string | null; linkLabel: string | null; closeLabel: string; moreLabel: string }) {
  const key = storageKey(text);
  // Read once after hydration; the server always renders the bar.
  const closedBefore = useSyncExternalStore(noSubscribe, () => wasClosed(key), () => false);
  const [closed, setClosed] = useState(false);
  if (closed || closedBefore) return null;

  function close() {
    try {
      sessionStorage.setItem(key, "closed");
    } catch {
      // Private browsing: it simply shows again on the next page.
    }
    setClosed(true);
  }

  const external = !!linkUrl && !linkUrl.startsWith("#");
  return (
    <div role="region" aria-label="Announcement" data-testid="announcement" className="site-gradient relative">
      <div className="mx-auto flex w-full max-w-6xl items-center gap-3 px-4 py-2 text-sm sm:px-6">
        <Megaphone aria-hidden className="size-4 shrink-0" />
        <p className="min-w-0 flex-1">
          <span className="font-medium">{text}</span>
          {linkUrl && (
            <>
              {" "}
              <a href={linkUrl} {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})} className="font-semibold whitespace-nowrap underline underline-offset-2">
                {linkLabel ?? moreLabel} →
              </a>
            </>
          )}
        </p>
        <button type="button" onClick={close} aria-label={closeLabel} className="rounded-full p-1 opacity-80 hover:bg-black/10 hover:opacity-100">
          <X aria-hidden className="size-4" />
        </button>
      </div>
    </div>
  );
}
