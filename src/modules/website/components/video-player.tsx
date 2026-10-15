"use client";

import { useState } from "react";
import { Play } from "lucide-react";

// The website's YouTube video as a light "facade": a thumbnail and a play button, and the real player only after
// a visitor taps it. Nothing from YouTube loads until then except the thumbnail, which keeps the page fast on mobile
// data. The address is rebuilt from the validated id, on the privacy-enhanced youtube-nocookie.com domain.

export function VideoPlayer({ youtubeId, title, playLabel }: { youtubeId: string; title: string; playLabel: string }) {
  const [playing, setPlaying] = useState(false);
  return (
    <div className="site-media relative aspect-video w-full overflow-hidden bg-black shadow-xl">
      {playing ? (
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${youtubeId}?autoplay=1&rel=0`}
          title={title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          className="absolute inset-0 size-full border-0"
        />
      ) : (
        <button type="button" onClick={() => setPlaying(true)} aria-label={`${playLabel}: ${title}`} className="group absolute inset-0 size-full">
          {/* eslint-disable-next-line @next/next/no-img-element -- YouTube's own thumbnail */}
          <img src={`https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg`} alt="" loading="lazy" className="size-full object-cover opacity-90 transition-opacity group-hover:opacity-100" />
          <span className="absolute inset-0 m-auto flex size-20 items-center justify-center rounded-full bg-[var(--site-primary)] text-[var(--site-on-primary)] shadow-2xl transition-transform group-hover:scale-110">
            <Play aria-hidden className="ml-1 size-9 fill-current" />
          </span>
        </button>
      )}
    </div>
  );
}
