import { Pin, Quote } from "lucide-react";
import { cn } from "@/lib/utils";
import { DAY_NAME } from "@/modules/institute/components/portal/week-schedule";
import { imageUrl, mediaClass, SectionHeading, type SectionProps, type Site } from "./shared";

// The sections filled from the institute's own lists: About (D131), Courses (Core), Notices (D128), Gallery (D125)
// and Testimonials (D130), drawn with the site's tokens (D135, D136).

export function About({ site, sig }: SectionProps) {
  const { aboutHeading, aboutText, aboutImageFileId } = site.settings;
  return (
    <div className={cn("grid items-center gap-10", aboutImageFileId && "md:grid-cols-2")}>
      <div>
        <SectionHeading id="ABOUT" sig={sig} align="left">
          {aboutHeading ?? `About ${site.profile.shortName ?? site.profile.name}`}
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

/** One line per subject and time, with its days: "Every day 16:00–17:00 · Physics" or "Sat, Mon 16:00–17:00 · Physics". */
function groupClasses(classes: ClassTime[]) {
  const groups = new Map<string, { key: string; time: string; subjectName: string; weekdays: ClassTime["weekday"][] }>();
  for (const cl of classes) {
    const key = `${cl.startsAt}|${cl.endsAt}|${cl.subjectName}`;
    const g = groups.get(key) ?? { key, time: `${cl.startsAt}–${cl.endsAt}`, subjectName: cl.subjectName, weekdays: [] };
    if (!g.weekdays.includes(cl.weekday)) g.weekdays.push(cl.weekday);
    groups.set(key, g);
  }
  return [...groups.values()].map((g) => ({ ...g, days: g.weekdays.length === 7 ? "Every day" : g.weekdays.map((d) => DAY_NAME[d].slice(0, 3)).join(", ") }));
}

export function Courses({ site, sig }: SectionProps) {
  const bento = sig.hero === "BENTO";
  return (
    <>
      <SectionHeading id="COURSES" sig={sig} sub="Our courses, subjects and class times.">
        Courses
      </SectionHeading>
      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {site.courses.map((c, i) => (
          <article key={c.name} data-testid="public-course" className={cn("site-card space-y-4 p-5", bento && i === 0 && site.courses.length > 2 && "lg:col-span-2")}>
            <div className="space-y-1">
              <h3 className="site-heading text-lg font-semibold">{c.name}</h3>
              {c.description && <p className="whitespace-pre-line text-sm text-muted-foreground">{c.description}</p>}
            </div>
            {c.subjects.length > 0 && (
              <p className="text-sm">
                <span className="text-muted-foreground">Subjects: </span>
                {c.subjects.join(", ")}
              </p>
            )}
            {c.batches.map((b) => (
              <div key={b.name} className="space-y-1 text-sm">
                <p className="font-medium text-[var(--site-primary-ink)]">{b.name}</p>
                {b.classes.length === 0 ? (
                  <p className="text-muted-foreground">Class times to be announced</p>
                ) : (
                  <ul className="space-y-0.5 text-muted-foreground">
                    {groupClasses(b.classes).map((g) => (
                      <li key={g.key}>
                        <span className="text-foreground">{g.days}</span> {g.time} · {g.subjectName}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </article>
        ))}
      </div>
    </>
  );
}

const LONG_NOTICE = 280;
const noticeDate = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/** Public notices (D128): pinned first, then the newest; a long notice opens with "Read more" (no script needed). */
export function Notices({ site, sig }: SectionProps) {
  return (
    <>
      <SectionHeading id="NOTICES" sig={sig}>
        Notices
      </SectionHeading>
      <ul className="grid gap-4 md:grid-cols-2">
        {site.notices.map((n) => (
          <li key={n.id} data-testid="public-notice" className="site-card space-y-2 p-5">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <time dateTime={n.noticeDate}>{noticeDate(n.noticeDate)}</time>
              {n.pinned && (
                <span className="inline-flex items-center gap-1 rounded-full bg-[color-mix(in_srgb,var(--site-primary)_14%,transparent)] px-2 py-0.5 font-medium text-[var(--site-primary-ink)]">
                  <Pin aria-hidden className="size-3" /> Pinned
                </span>
              )}
            </div>
            <h3 className="site-heading text-lg font-semibold">{n.title}</h3>
            {n.body.length <= LONG_NOTICE ? (
              <p className="whitespace-pre-line text-sm text-muted-foreground">{n.body}</p>
            ) : (
              <details className="group text-sm text-muted-foreground">
                <summary className="cursor-pointer list-none">
                  <span className="whitespace-pre-line group-open:hidden">{n.body.slice(0, LONG_NOTICE).trimEnd()}… </span>
                  <span className="font-medium text-[var(--site-primary-ink)] group-open:hidden">Read more</span>
                  <span className="hidden font-medium text-[var(--site-primary-ink)] group-open:inline">Show less</span>
                </summary>
                <p className="mt-1 whitespace-pre-line">{n.body}</p>
              </details>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}

/** The gallery (D125): photos in the order set, each opening full size. Bento makes the first photo a large tile. */
export function Gallery({ site, sig }: SectionProps) {
  const bento = sig.hero === "BENTO" && site.gallery.length >= 5;
  return (
    <>
      <SectionHeading id="GALLERY" sig={sig}>
        Gallery
      </SectionHeading>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {site.gallery.map((p, i) => (
          <li key={p.id} className={cn(bento && i === 0 && "col-span-2 row-span-2")}>
            <figure className="flex h-full flex-col gap-1.5">
              <a href={imageUrl(p.fileId)} target="_blank" rel="noopener" className="site-media block flex-1 overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element -- served by the public website-image endpoint */}
                <img src={imageUrl(p.fileId)} alt={p.caption ?? ""} loading="lazy" className="aspect-square size-full object-cover transition-transform duration-500 hover:scale-105" />
              </a>
              {p.caption && <figcaption className="text-sm text-muted-foreground">{p.caption}</figcaption>}
            </figure>
          </li>
        ))}
      </ul>
    </>
  );
}

/** Testimonials entered by the office (D130). */
export function Testimonials({ site, sig }: SectionProps) {
  return (
    <>
      <SectionHeading id="TESTIMONIALS" sig={sig}>
        What our students say
      </SectionHeading>
      <ul className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {site.testimonials.map((q) => (
          <li key={q.id} data-testid="public-testimonial">
            <figure className="site-card flex h-full flex-col gap-4 p-6">
              <Quote aria-hidden className="size-6 text-[var(--site-accent-ink)]" />
              <blockquote className="flex-1 whitespace-pre-line leading-relaxed">{q.quote}</blockquote>
              <figcaption className="flex items-center gap-3">
                {q.photoFileId ? (
                  // eslint-disable-next-line @next/next/no-img-element -- served by the public website-image endpoint
                  <img src={imageUrl(q.photoFileId)} alt="" loading="lazy" className="size-11 rounded-full object-cover" />
                ) : (
                  <span aria-hidden className="flex size-11 items-center justify-center rounded-full bg-[var(--site-primary)] font-semibold text-[var(--site-on-primary)]">
                    {q.name.slice(0, 1).toUpperCase()}
                  </span>
                )}
                <span>
                  <span className="block font-semibold">{q.name}</span>
                  {q.line && <span className="block text-sm text-muted-foreground">{q.line}</span>}
                </span>
              </figcaption>
            </figure>
          </li>
        ))}
      </ul>
    </>
  );
}
