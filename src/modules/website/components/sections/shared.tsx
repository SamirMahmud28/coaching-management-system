import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { WebsiteSectionKey } from "@/server/core/db/schema/website";
import type { PublicWebsite } from "@/server/modules/website/public";
import type { SocialNetwork } from "@/server/modules/website/site-content";
import type { SiteLabels } from "../../i18n";
import type { HeadingMark, ThemeSignature } from "../../themes";

// Pieces every website section shares.

export type Site = PublicWebsite;

export interface SectionProps {
  site: Site;
  sig: ThemeSignature;
  /** The built-in labels in the site's language. */
  t: SiteLabels;
}

/** A section's heading and the line under it: the office's own words when set, else the built-in ones. */
export function sectionWords({ site, t }: SectionProps, key: WebsiteSectionKey): { title: string; subtitle: string | undefined } {
  const own = site.settings.content.sectionTitles[key];
  return { title: own?.title ?? t.title[key], subtitle: own?.subtitle ?? t.subtitle[key] };
}

export const imageUrl = (fileId: string) => `/api/public/website-images/${fileId}`;
export const telHref = (phone: string) => `tel:${phone.replace(/[^\d+]/g, "")}`;

/** The picture shape of the theme: rounded to the site's corners, an organic blob, an arch, or framed with an offset. */
export function mediaClass(media: ThemeSignature["media"]): string {
  switch (media) {
    case "blob":
      return "rounded-[58%_42%_52%_48%/48%_58%_42%_52%]";
    case "arch":
      return "rounded-t-full rounded-b-[var(--site-radius)]";
    case "framed":
      return "site-media ring-2 ring-[var(--site-primary)] ring-offset-4 ring-offset-background";
    case "rounded":
      return "site-media";
  }
}

function Mark({ mark, centred }: { mark: HeadingMark; centred: boolean }) {
  const place = centred && "mx-auto";
  switch (mark) {
    case "NONE":
      return null;
    case "LINE":
      return <span aria-hidden className={cn("block h-px w-24 bg-[var(--site-primary-ink)] opacity-60", place)} />;
    case "DOTS":
      return (
        <span aria-hidden className={cn("flex w-max gap-1.5", place)}>
          <span className="size-2 rounded-full bg-[var(--site-primary)]" />
          <span className="size-2 rounded-full bg-[var(--site-accent)]" />
          <span className="size-2 rounded-full bg-[var(--site-primary)]" />
        </span>
      );
    case "GRADIENT":
      return <span aria-hidden className={cn("block h-1.5 w-20 rounded-full bg-[image:var(--site-gradient)]", place)} />;
    case "BLOCK":
      return <span aria-hidden className={cn("block h-2 w-16 bg-[var(--site-primary)]", place)} />;
    case "BAR":
      return <span aria-hidden className={cn("block h-1 w-14 rounded-full bg-[var(--site-primary)]", place)} />;
  }
}

export function SectionHeading({ id, sig, children, sub, align }: { id: WebsiteSectionKey; sig: ThemeSignature; children: ReactNode; sub?: ReactNode; align?: "left" }) {
  const centred = (align ?? sig.align) === "center";
  return (
    <div className={cn("mb-8 space-y-3", centred ? "text-center" : "text-left")}>
      <h2 id={`${id.toLowerCase()}-heading`} className={cn("site-heading", sig.title)}>
        {children}
      </h2>
      <Mark mark={sig.mark} centred={centred} />
      {sub && <p className={cn("text-muted-foreground", centred && "mx-auto max-w-2xl")}>{sub}</p>}
    </div>
  );
}

/** Simple marks for each social network, drawn in the current text colour. */
export function SocialIcon({ network, className }: { network: SocialNetwork; className?: string }) {
  const common = { "aria-hidden": true, viewBox: "0 0 24 24", className: cn("size-4", className) } as const;
  switch (network) {
    case "facebook":
      return (
        <svg {...common} fill="currentColor">
          <path d="M13.5 21v-7.5h2.6l.4-3h-3V8.6c0-.9.3-1.5 1.5-1.5H16.6V4.4c-.3 0-1.2-.1-2.3-.1-2.3 0-3.8 1.4-3.8 3.9v2.3H8v3h2.5V21h3Z" />
        </svg>
      );
    case "youtube":
      return (
        <svg {...common} fill="currentColor">
          <path d="M21.6 7.2a2.6 2.6 0 0 0-1.8-1.8C18.2 5 12 5 12 5s-6.2 0-7.8.4a2.6 2.6 0 0 0-1.8 1.8C2 8.8 2 12 2 12s0 3.2.4 4.8a2.6 2.6 0 0 0 1.8 1.8C5.8 19 12 19 12 19s6.2 0 7.8-.4a2.6 2.6 0 0 0 1.8-1.8c.4-1.6.4-4.8.4-4.8s0-3.2-.4-4.8ZM10 15V9l5.2 3L10 15Z" />
        </svg>
      );
    case "instagram":
      return (
        <svg {...common} fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="3" width="18" height="18" rx="5" />
          <circle cx="12" cy="12" r="4" />
          <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
        </svg>
      );
    case "tiktok":
      return (
        <svg {...common} fill="currentColor">
          <path d="M16.6 3c.3 2.2 1.6 3.6 3.9 3.8v2.6c-1.4.1-2.6-.3-3.9-1.1v5.5c0 3.4-2.4 5.7-5.6 5.7A5.4 5.4 0 0 1 5.5 14c0-3.3 2.9-5.8 6.4-5.2v2.8c-1.6-.4-3.4.6-3.4 2.4 0 1.5 1.1 2.6 2.5 2.6 1.6 0 2.6-1 2.6-3V3h3Z" />
        </svg>
      );
    case "linkedin":
      return (
        <svg {...common} fill="currentColor">
          <path d="M6.9 8.8H3.6V20h3.3V8.8ZM5.2 3.5a1.9 1.9 0 1 0 0 3.8 1.9 1.9 0 0 0 0-3.8ZM20.4 13.6c0-3.1-1.7-4.9-4.3-4.9-1.6 0-2.6.8-3.1 1.6V8.8H9.8V20h3.3v-5.6c0-1.5.6-2.6 2-2.6s1.9 1 1.9 2.6V20h3.4v-6.4Z" />
        </svg>
      );
  }
}

export const SOCIAL_LABEL: Record<SocialNetwork, string> = { facebook: "Facebook", youtube: "YouTube", instagram: "Instagram", tiktok: "TikTok", linkedin: "LinkedIn" };

/** The institute's social links, as round icon buttons. */
export function SocialLinks({ site, className }: { site: Site; className?: string }) {
  const links = (Object.entries(site.settings.content.social) as [SocialNetwork, string | null][]).filter((e): e is [SocialNetwork, string] => !!e[1]);
  if (!links.length) return null;
  return (
    <ul className={cn("flex items-center gap-2", className)}>
      {links.map(([network, href]) => (
        <li key={network}>
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={SOCIAL_LABEL[network]}
            className="flex size-9 items-center justify-center rounded-full border text-muted-foreground transition-colors hover:border-[var(--site-primary)] hover:bg-[var(--site-primary)] hover:text-[var(--site-on-primary)]"
          >
            <SocialIcon network={network} />
          </a>
        </li>
      ))}
    </ul>
  );
}
