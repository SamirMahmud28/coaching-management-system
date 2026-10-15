import {
  Award, BadgeCheck, BookOpen, Brain, Bus, Calculator, ClipboardCheck, Clock, FlaskConical, GraduationCap, HeartHandshake, Laptop, Lightbulb, MapPin, MessageCircle,
  Microscope, PenTool, ShieldCheck, Smile, Star, Target, Trophy, Users, Wallet, ChevronDown, type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { FeatureIcon } from "@/server/modules/website/site-content";
import { VideoPlayer } from "../video-player";
import { imageUrl, SectionHeading, sectionWords, type SectionProps } from "./shared";

// The showcase sections: Stats, Why choose us, Faculty, Achievers, Video and FAQ. Filled from the
// Content tab and the Faculty and Achievers lists; each is left out while it has nothing to show.

export const FEATURE_ICON: Record<FeatureIcon, LucideIcon> = {
  GraduationCap, BookOpen, Users, Trophy, Clock, Target, Award, Brain, FlaskConical, Calculator, Laptop, ClipboardCheck, ShieldCheck, Smile, Star, HeartHandshake,
  Lightbulb, MapPin, Wallet, Bus, Microscope, PenTool, MessageCircle, BadgeCheck,
};

/** Counters such as "1,200+ students". The number is written in full in the page; the count-up is added on top. */
export function Stats(props: SectionProps) {
  const { site, sig, t } = props;
  const words = sectionWords(props, "STATS");
  const stats = site.settings.content.stats;
  return (
    <>
      <SectionHeading id="STATS" sig={sig} sub={words.subtitle}>
        {words.title}
      </SectionHeading>
      <ul className={cn("grid gap-4", stats.length >= 4 ? "grid-cols-2 lg:grid-cols-4" : stats.length === 3 ? "grid-cols-1 sm:grid-cols-3" : "grid-cols-2")}>
        {stats.map((s, i) => (
          <li key={i} data-testid="public-stat" className="site-card flex flex-col items-center gap-1 p-6 text-center">
            <span className="site-heading site-gradient-text text-4xl font-bold tabular-nums sm:text-5xl">
              <span data-count-to={s.value}>{t.num(s.value.toLocaleString("en-US"))}</span>
              {s.suffix}
            </span>
            <span className="text-sm text-muted-foreground">{s.label}</span>
          </li>
        ))}
      </ul>
    </>
  );
}

/** "Why choose us": reasons, each with an icon in the main colour. */
export function Features(props: SectionProps) {
  const { site, sig } = props;
  const words = sectionWords(props, "FEATURES");
  return (
    <>
      <SectionHeading id="FEATURES" sig={sig} sub={words.subtitle}>
        {words.title}
      </SectionHeading>
      <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {site.settings.content.features.map((f, i) => {
          const Icon = FEATURE_ICON[f.icon];
          return (
            <li key={i} data-testid="public-feature" className="site-card space-y-3 p-6">
              <span className="flex size-12 items-center justify-center rounded-[var(--site-radius)] bg-[color-mix(in_srgb,var(--site-primary)_14%,transparent)] text-[var(--site-primary-ink)]">
                <Icon aria-hidden className="size-6" />
              </span>
              <h3 className="site-heading text-lg font-semibold">{f.title}</h3>
              {f.text && <p className="text-sm leading-relaxed text-muted-foreground">{f.text}</p>}
            </li>
          );
        })}
      </ul>
    </>
  );
}

function Avatar({ fileId, name, className }: { fileId: string | null; name: string; className: string }) {
  return fileId ? (
    // eslint-disable-next-line @next/next/no-img-element -- served by the public website-image endpoint
    <img src={imageUrl(fileId)} alt="" loading="lazy" className={cn("object-cover", className)} />
  ) : (
    <span aria-hidden className={cn("site-gradient flex items-center justify-center font-semibold", className)}>
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

/** The instructors the office shows: photo, name, subjects and line; never contact details. */
export function Faculty(props: SectionProps) {
  const { site, sig } = props;
  const words = sectionWords(props, "FACULTY");
  return (
    <>
      <SectionHeading id="FACULTY" sig={sig} sub={words.subtitle}>
        {words.title}
      </SectionHeading>
      <ul className="grid grid-cols-2 gap-5 md:grid-cols-3 lg:grid-cols-4">
        {site.faculty.map((f) => (
          <li key={f.id} data-testid="public-faculty" className="site-card overflow-hidden text-center">
            <Avatar fileId={f.photoFileId} name={f.name} className="aspect-square w-full text-5xl" />
            <div className="space-y-1 p-4">
              <h3 className="site-heading font-semibold">{f.name}</h3>
              {f.subjects.length > 0 && <p className="text-sm font-medium text-[var(--site-primary-ink)]">{f.subjects.join(", ")}</p>}
              {f.line && <p className="text-xs text-muted-foreground">{f.line}</p>}
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

/** Top results typed in by the office. */
export function Achievers(props: SectionProps) {
  const { site, sig } = props;
  const words = sectionWords(props, "ACHIEVERS");
  return (
    <>
      <SectionHeading id="ACHIEVERS" sig={sig} sub={words.subtitle}>
        {words.title}
      </SectionHeading>
      <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {site.achievers.map((a) => (
          <li key={a.id} data-testid="public-achiever" className="site-card flex flex-col items-center gap-2 p-4 text-center">
            <span className="rounded-full bg-[image:var(--site-gradient)] p-[3px]">
              <Avatar fileId={a.photoFileId} name={a.name} className="size-20 rounded-full border-2 border-background text-2xl" />
            </span>
            <span className="site-heading text-sm leading-tight font-semibold">{a.name}</span>
            <span className="rounded-full bg-[color-mix(in_srgb,var(--site-accent)_16%,transparent)] px-2 py-0.5 text-xs font-semibold text-[var(--site-accent-ink)]">{a.result}</span>
            {a.exam && <span className="text-xs text-muted-foreground">{a.exam}</span>}
          </li>
        ))}
      </ul>
    </>
  );
}

/** The institute's YouTube videos, each loaded only when played: one large, or several in a grid. */
export function Video(props: SectionProps) {
  const { site, sig, t } = props;
  const words = sectionWords(props, "VIDEO");
  const videos = site.settings.content.videos;
  if (videos.length === 1) {
    const [video] = videos;
    return (
      <>
        <SectionHeading id="VIDEO" sig={sig} sub={words.subtitle ?? video.title ?? undefined}>
          {words.title}
        </SectionHeading>
        <div className="mx-auto max-w-4xl">
          <VideoPlayer youtubeId={video.youtubeId} title={video.title ?? words.title} playLabel={t.playVideo} />
        </div>
      </>
    );
  }
  return (
    <>
      <SectionHeading id="VIDEO" sig={sig} sub={words.subtitle}>
        {words.title}
      </SectionHeading>
      <ul className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {videos.map((v, i) => (
          <li key={`${v.youtubeId}-${i}`} data-testid="public-video" className="space-y-2">
            <VideoPlayer youtubeId={v.youtubeId} title={v.title ?? `${words.title} ${i + 1}`} playLabel={t.playVideo} />
            {v.title && <p className="site-heading font-semibold">{v.title}</p>}
          </li>
        ))}
      </ul>
    </>
  );
}

/** Questions and answers, opening in place without any script: one column, or two on wide screens. */
export function Faqs(props: SectionProps) {
  const { site, sig } = props;
  const words = sectionWords(props, "FAQ");
  const two = site.settings.design.faqLayout === "TWO_COLUMN";
  return (
    <>
      <SectionHeading id="FAQ" sig={sig} sub={words.subtitle}>
        {words.title}
      </SectionHeading>
      <ul className={cn("gap-3", two ? "grid md:grid-cols-2" : "mx-auto flex max-w-3xl flex-col")}>
        {site.settings.content.faqs.map((f, i) => (
          <li key={i} data-testid="public-faq">
            <details className="site-card group h-full p-5 [&_summary::-webkit-details-marker]:hidden">
              <summary className="flex cursor-pointer list-none items-start justify-between gap-4 font-semibold">
                <span>{f.question}</span>
                <ChevronDown aria-hidden className="mt-0.5 size-5 shrink-0 text-[var(--site-primary-ink)] transition-transform group-open:rotate-180" />
              </summary>
              <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">{f.answer}</p>
            </details>
          </li>
        ))}
      </ul>
    </>
  );
}
