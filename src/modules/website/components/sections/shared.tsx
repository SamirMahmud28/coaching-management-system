import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { WebsiteSectionKey } from "@/server/core/db/schema/website";
import type { PublicWebsite } from "@/server/modules/website/public";
import type { HeadingMark, ThemeSignature } from "../../themes";

// Pieces every website section shares (D135, D136).

export type Site = PublicWebsite;

export interface SectionProps {
  site: Site;
  sig: ThemeSignature;
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
