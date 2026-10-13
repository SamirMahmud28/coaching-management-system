import type { ReactNode } from "react";
import { Pin, Quote } from "lucide-react";
import { cn } from "@/lib/utils";
import { imageUrl, mediaClass, SectionHeading, sectionWords, type SectionProps, type Site } from "./shared";

// The sections filled from the institute's own lists: About (D131), Courses (Core), Notices (D128), Gallery (D125)
// and Testimonials (D130), drawn with the site's tokens (D135, D136), in the layout chosen for each (D135) and with the
// labels in the site's language (D140).

/** A row that scrolls sideways and snaps to each item; swipeable on phones without any script. */
function Carousel({ children, label }: { children: ReactNode; label: string }) {
  return (
    <ul aria-label={label} className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth px-4 pb-4 [scrollbar-width:thin] sm:mx-0 sm:px-0">
      {children}
    </ul>
  );
}
const slide = "w-[85%] shrink-0 snap-start sm:w-[46%] lg:w-[31.5%]";

export function About(props: SectionProps) {
  const { site, sig, t } = props;
  const { aboutHeading, aboutText, aboutImageFileId } = site.settings;
  return (
    <div className={cn("grid items-center gap-10", aboutImageFileId && "md:grid-cols-2")}>
      <div>
        <SectionHeading id="ABOUT" sig={sig} align="left">
          {aboutHeading ?? t.aboutTitle(site.profile.shortName ?? site.profile.name)}
        </SectionHeading>
        {aboutText && <p className="whitespace-pre-line leading-relaxed text-muted-foreground">{aboutText}</p>}
      </div>
      {aboutImageFileId && (
        // eslint-disable-next-line @next/next/no-img-element -- served by the public website-image endpoint
        <img src={imageUrl(aboutImageFileId)} alt="" className={cn("aspect-[4/3] w-full object-cover", mediaClass(sig.media), sig.hero === "SPLIT" && "md:order-first")} />
      )}
    </div>
  );
}

type ClassTime = Site["courses"][number]["batches"][number]["classes"][number];
type Batch = Site["courses"][number]["batches"][number];

/** One line per subject and time, with its days: "Every day 16:00–17:00 · Physics" or "Sat, Mon 16:00–17:00 · Physics". */
function groupClasses(classes: ClassTime[], t: SectionProps["t"]) {
  const groups = new Map<string, { key: string; time: string; subjectName: string; weekdays: ClassTime["weekday"][] }>();
  for (const cl of classes) {
    const key = `${cl.startsAt}|${cl.endsAt}|${cl.subjectName}`;
    const g = groups.get(key) ?? { key, time: t.num(`${cl.startsAt}–${cl.endsAt}`), subjectName: cl.subjectName, weekdays: [] };
    if (!g.weekdays.includes(cl.weekday)) g.weekdays.push(cl.weekday);
    groups.set(key, g);
  }
  return [...groups.values()].map((g) => ({ ...g, days: g.weekdays.length === 7 ? t.everyDay : g.weekdays.map((d) => t.day[d]).join(", ") }));
}

function BatchTimes({ batch, t }: { batch: Batch; t: SectionProps["t"] }) {
  return (
    <div className="space-y-1 text-sm">
      <p className="font-medium text-[var(--site-primary-ink)]">{batch.name}</p>
      {batch.classes.length === 0 ? (
        <p className="text-muted-foreground">{t.timesTba}</p>
      ) : (
        <ul className="space-y-0.5 text-muted-foreground">
          {groupClasses(batch.classes, t).map((g) => (
            <li key={g.key}>
              <span className="text-foreground">{g.days}</span> {g.time} · {g.subjectName}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function Courses(props: SectionProps) {
  const { site, sig, t } = props;
  const words = sectionWords(props, "COURSES");
  const bento = sig.hero === "BENTO";
  const heading = (
    <SectionHeading id="COURSES" sig={sig} sub={words.subtitle}>
      {words.title}
    </SectionHeading>
  );
  const subjects = (c: Site["courses"][number]) =>
    c.subjects.length > 0 && (
      <p className="text-sm">
        <span className="text-muted-foreground">{t.subjects}</span>
        {c.subjects.join(", ")}
      </p>
    );

  if (site.settings.design.courseLayout === "LIST") {
    return (
      <>
        {heading}
        <div className="site-card divide-y overflow-hidden">
          {site.courses.map((c) => (
            <article key={c.name} data-testid="public-course" className="grid gap-4 p-5 sm:p-6 md:grid-cols-[2fr_3fr]">
              <div className="space-y-2">
                <h3 className="site-heading text-lg font-semibold">{c.name}</h3>
                {c.description && <p className="whitespace-pre-line text-sm text-muted-foreground">{c.description}</p>}
                {subjects(c)}
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                {c.batches.map((b) => (
                  <BatchTimes key={b.name} batch={b} t={t} />
                ))}
              </div>
            </article>
          ))}
        </div>
      </>
    );
  }

  return (
    <>
      {heading}
      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {site.courses.map((c, i) => (
          <article key={c.name} data-testid="public-course" className={cn("site-card space-y-4 p-5", bento && i === 0 && site.courses.length > 2 && "lg:col-span-2")}>
            <div className="space-y-1">
              <h3 className="site-heading text-lg font-semibold">{c.name}</h3>
              {c.description && <p className="whitespace-pre-line text-sm text-muted-foreground">{c.description}</p>}
            </div>
            {subjects(c)}
            {c.batches.map((b) => (
              <BatchTimes key={b.name} batch={b} t={t} />
            ))}
          </article>
        ))}
      </div>
    </>
  );
}

const LONG_NOTICE = 280;

function NoticeBody({ body, t }: { body: string; t: SectionProps["t"] }) {
  if (body.length <= LONG_NOTICE) return <p className="whitespace-pre-line text-sm text-muted-foreground">{body}</p>;
  return (
    <details className="group text-sm text-muted-foreground">
      <summary className="cursor-pointer list-none">
        <span className="whitespace-pre-line group-open:hidden">{body.slice(0, LONG_NOTICE).trimEnd()}… </span>
        <span className="font-medium text-[var(--site-primary-ink)] group-open:hidden">{t.readMore}</span>
        <span className="hidden font-medium text-[var(--site-primary-ink)] group-open:inline">{t.showLess}</span>
      </summary>
      <p className="mt-1 whitespace-pre-line">{body}</p>
    </details>
  );
}

const PinnedBadge = ({ t }: { t: SectionProps["t"] }) => (
  <span className="inline-flex items-center gap-1 rounded-full bg-[color-mix(in_srgb,var(--site-primary)_14%,transparent)] px-2 py-0.5 text-xs font-medium text-[var(--site-primary-ink)]">
    <Pin aria-hidden className="size-3" /> {t.pinned}
  </span>
);

/** Public notices (D128): pinned first, then the newest; a long notice opens with "Read more" (no script needed). */
export function Notices(props: SectionProps) {
  const { site, sig, t } = props;
  const words = sectionWords(props, "NOTICES");
  const heading = (
    <SectionHeading id="NOTICES" sig={sig} sub={words.subtitle}>
      {words.title}
    </SectionHeading>
  );

  if (site.settings.design.noticeLayout === "TIMELINE") {
    return (
      <>
        {heading}
        <ol className="relative mx-auto max-w-3xl space-y-8 border-l-2 border-[color-mix(in_srgb,var(--site-primary)_35%,transparent)] pl-8">
          {site.notices.map((n) => (
            <li key={n.id} data-testid="public-notice" className="relative space-y-2">
              <span aria-hidden className="absolute top-1 -left-[41px] size-4 rounded-full bg-[var(--site-primary)] ring-4 ring-background" />
              <div className="flex flex-wrap items-center gap-2">
                <time dateTime={n.noticeDate} className="text-sm font-medium text-[var(--site-primary-ink)]">
                  {t.date(n.noticeDate)}
                </time>
                {n.pinned && <PinnedBadge t={t} />}
              </div>
              <h3 className="site-heading text-lg font-semibold">{n.title}</h3>
              <NoticeBody body={n.body} t={t} />
            </li>
          ))}
        </ol>
      </>
    );
  }

  return (
    <>
      {heading}
      <ul className="grid gap-4 md:grid-cols-2">
        {site.notices.map((n) => (
          <li key={n.id} data-testid="public-notice" className="site-card space-y-2 p-5">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <time dateTime={n.noticeDate}>{t.date(n.noticeDate)}</time>
              {n.pinned && <PinnedBadge t={t} />}
            </div>
            <h3 className="site-heading text-lg font-semibold">{n.title}</h3>
            <NoticeBody body={n.body} t={t} />
          </li>
        ))}
      </ul>
    </>
  );
}

/** The gallery (D125): photos in the order set, each opening full size, as a grid, masonry or a swipeable row. */
export function Gallery(props: SectionProps) {
  const { site, sig } = props;
  const words = sectionWords(props, "GALLERY");
  const layout = site.settings.design.galleryLayout;
  const photo = (p: Site["gallery"][number], className: string) => (
    <figure className="flex h-full flex-col gap-1.5">
      <a href={imageUrl(p.fileId)} target="_blank" rel="noopener" className="site-media block flex-1 overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element -- served by the public website-image endpoint */}
        <img src={imageUrl(p.fileId)} alt={p.caption ?? ""} loading="lazy" className={cn("w-full object-cover transition-transform duration-500 hover:scale-105", className)} />
      </a>
      {p.caption && <figcaption className="text-sm text-muted-foreground">{p.caption}</figcaption>}
    </figure>
  );
  const heading = (
    <SectionHeading id="GALLERY" sig={sig} sub={words.subtitle}>
      {words.title}
    </SectionHeading>
  );

  if (layout === "CAROUSEL") {
    return (
      <>
        {heading}
        <Carousel label={words.title}>
          {site.gallery.map((p) => (
            <li key={p.id} className={slide}>
              {photo(p, "aspect-[4/3]")}
            </li>
          ))}
        </Carousel>
      </>
    );
  }
  if (layout === "MASONRY") {
    return (
      <>
        {heading}
        <ul className="columns-2 gap-3 sm:columns-3 lg:columns-4">
          {site.gallery.map((p) => (
            <li key={p.id} className="mb-3 break-inside-avoid">
              {photo(p, "h-auto")}
            </li>
          ))}
        </ul>
      </>
    );
  }
  const bento = sig.hero === "BENTO" && site.gallery.length >= 5;
  return (
    <>
      {heading}
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {site.gallery.map((p, i) => (
          <li key={p.id} className={cn(bento && i === 0 && "col-span-2 row-span-2")}>
            {photo(p, "aspect-square size-full")}
          </li>
        ))}
      </ul>
    </>
  );
}

function Person({ q, size = "md" }: { q: Site["testimonials"][number]; size?: "md" | "lg" }) {
  const avatar = size === "lg" ? "size-14" : "size-11";
  return (
    <figcaption className={cn("flex items-center gap-3", size === "lg" && "justify-center")}>
      {q.photoFileId ? (
        // eslint-disable-next-line @next/next/no-img-element -- served by the public website-image endpoint
        <img src={imageUrl(q.photoFileId)} alt="" loading="lazy" className={cn("rounded-full object-cover", avatar)} />
      ) : (
        <span aria-hidden className={cn("flex items-center justify-center rounded-full bg-[var(--site-primary)] font-semibold text-[var(--site-on-primary)]", avatar)}>
          {q.name.slice(0, 1).toUpperCase()}
        </span>
      )}
      <span className="text-left">
        <span className="block font-semibold">{q.name}</span>
        {q.line && <span className="block text-sm text-muted-foreground">{q.line}</span>}
      </span>
    </figcaption>
  );
}

function TestimonialCard({ q }: { q: Site["testimonials"][number] }) {
  return (
    <figure className="site-card flex h-full flex-col gap-4 p-6">
      <Quote aria-hidden className="size-6 text-[var(--site-accent-ink)]" />
      <blockquote className="flex-1 whitespace-pre-line leading-relaxed">{q.quote}</blockquote>
      <Person q={q} />
    </figure>
  );
}

/** Testimonials entered by the office (D130): cards, a swipeable row, or one in the spotlight with the rest below. */
export function Testimonials(props: SectionProps) {
  const { site, sig } = props;
  const words = sectionWords(props, "TESTIMONIALS");
  const layout = site.settings.design.testimonialLayout;
  const heading = (
    <SectionHeading id="TESTIMONIALS" sig={sig} sub={words.subtitle}>
      {words.title}
    </SectionHeading>
  );

  if (layout === "CAROUSEL") {
    return (
      <>
        {heading}
        <Carousel label={words.title}>
          {site.testimonials.map((q) => (
            <li key={q.id} data-testid="public-testimonial" className={slide}>
              <TestimonialCard q={q} />
            </li>
          ))}
        </Carousel>
      </>
    );
  }
  if (layout === "SPOTLIGHT") {
    const [first, ...rest] = site.testimonials;
    return (
      <>
        {heading}
        <figure data-testid="public-testimonial" className="mx-auto max-w-3xl space-y-6 text-center">
          <Quote aria-hidden className="mx-auto size-10 text-[var(--site-accent-ink)]" />
          <blockquote className="site-heading text-xl leading-relaxed whitespace-pre-line sm:text-2xl">{first.quote}</blockquote>
          <Person q={first} size="lg" />
        </figure>
        {rest.length > 0 && (
          <ul className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {rest.map((q) => (
              <li key={q.id} data-testid="public-testimonial">
                <TestimonialCard q={q} />
              </li>
            ))}
          </ul>
        )}
      </>
    );
  }
  return (
    <>
      {heading}
      <ul className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {site.testimonials.map((q) => (
          <li key={q.id} data-testid="public-testimonial">
            <TestimonialCard q={q} />
          </li>
        ))}
      </ul>
    </>
  );
}
