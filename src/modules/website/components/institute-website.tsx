import type { CSSProperties, ReactNode } from "react";
import { ExternalLink, Globe, Mail, MapPin, Phone, Pin, Quote } from "lucide-react";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { DAY_NAME } from "@/modules/institute/components/portal/week-schedule";
import type { WebsiteSectionKey } from "@/server/core/db/schema/website";
import type { PublicWebsite } from "@/server/modules/website/public";
import { HEADING_FONT_FAMILY } from "../fonts";
import { EnquiryForm } from "./enquiry-form";
import { SECTION_LABELS, type WebsiteTheme } from "../options";

// The institute's themed public website (Website module, D20, D124–D133). Server-rendered; every section is filled
// from the institute's own data. Sections without content are left out, together with their menu link.

const FALLBACK_BRAND = "#2563eb";
const imageUrl = (fileId: string) => `/api/public/website-images/${fileId}`;

/** Black or white, whichever reads better on the brand colour. */
function textOn(hex: string): string {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4 ? "#111827" : "#ffffff";
}

interface ThemeStyle {
  /** Section heading block. */
  heading: string;
  title: string;
  /** Every other section's background. */
  band: string;
  card: string;
}

const THEME: Record<WebsiteTheme, ThemeStyle> = {
  CLASSIC: {
    heading: "text-center",
    title: "text-2xl font-semibold sm:text-3xl",
    band: "bg-muted/40",
    card: "rounded-lg border bg-card",
  },
  MODERN: {
    heading: "text-left",
    title: "text-3xl font-bold tracking-tight",
    band: "bg-[color-mix(in_srgb,var(--site-brand)_6%,transparent)]",
    card: "rounded-2xl bg-card shadow-sm ring-1 ring-border/60",
  },
  BOLD: {
    heading: "text-left",
    title: "text-3xl font-extrabold uppercase tracking-tight sm:text-4xl",
    band: "bg-muted/60",
    card: "rounded-md border border-t-4 border-t-[var(--site-brand)] bg-card",
  },
};

type Site = PublicWebsite;

export function InstituteWebsite({ site }: { site: Site }) {
  const { settings, profile } = site;
  const theme = settings.theme;
  const brand = profile.primaryColor ?? FALLBACK_BRAND;
  const style = { "--site-brand": brand, "--site-on-brand": textOn(brand), "--site-heading": HEADING_FONT_FAMILY[settings.headingFont] } as CSSProperties;

  const rendered = settings.sections
    .filter((s) => s.enabled)
    .map((s) => ({ key: s.key, node: renderSection(s.key, site) }))
    .filter((s): s is { key: WebsiteSectionKey; node: ReactNode } => s.node !== null);
  const has = (key: WebsiteSectionKey) => rendered.some((s) => s.key === key);

  return (
    <div data-testid="website" data-site-theme={theme.toLowerCase()} style={style} className="flex min-h-screen flex-1 flex-col">
      <header className="sticky top-0 z-20 border-b bg-background/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center gap-3 px-4 py-3 sm:px-6">
          {profile.hasLogo && (
            // eslint-disable-next-line @next/next/no-img-element -- served by the public logo endpoint
            <img src="/api/public/logo" alt="" className="size-10 rounded-md object-contain" />
          )}
          <a href="#top" className="min-w-0 flex-1 truncate text-lg font-semibold [font-family:var(--site-heading)]">
            {profile.shortName ?? profile.name}
          </a>
          <nav aria-label="Sections" className="hidden items-center gap-5 text-sm text-muted-foreground lg:flex">
            {rendered.map((s) => (
              <a key={s.key} href={`#${s.key.toLowerCase()}`} className="hover:text-foreground">
                {SECTION_LABELS[s.key].nav}
              </a>
            ))}
          </nav>
          <ThemeToggle />
          <Button asChild variant="outline">
            <a href="/login">Sign in</a>
          </Button>
        </div>
      </header>

      <main id="top" className="flex-1">
        <Hero site={site} enquiry={has("ENQUIRY")} />
        {rendered.map((s, i) => (
          <section key={s.key} id={s.key.toLowerCase()} aria-labelledby={`${s.key.toLowerCase()}-heading`} data-testid={`section-${s.key.toLowerCase()}`} className={cn("scroll-mt-20 py-14 sm:py-20", i % 2 === 1 && THEME[theme].band)}>
            <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">{s.node}</div>
          </section>
        ))}
      </main>

      <footer className="border-t py-8 text-sm text-muted-foreground">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>
            © {new Date().getFullYear()} {profile.name}
          </p>
          <a href="/login" className="hover:text-foreground hover:underline">
            Students and staff: sign in
          </a>
        </div>
      </footer>
    </div>
  );

  function renderSection(key: WebsiteSectionKey, s: Site): ReactNode | null {
    const t = THEME[theme];
    switch (key) {
      case "ABOUT":
        return s.settings.aboutText || s.settings.aboutImageFileId ? <About site={s} t={t} /> : null;
      case "COURSES":
        return s.courses.length ? <Courses site={s} t={t} /> : null;
      case "CONTACT":
        return contactsOf(s).length ? <Contact site={s} t={t} /> : null;
      case "NOTICES":
        return s.notices.length ? <Notices site={s} t={t} /> : null;
      case "GALLERY":
        return s.gallery.length ? <Gallery site={s} t={t} /> : null;
      case "TESTIMONIALS":
        return s.testimonials.length ? <Testimonials site={s} t={t} /> : null;
      case "ENQUIRY":
        return <Enquiry site={s} t={t} />;
    }
  }
}

function SectionHeading({ id, t, children, sub }: { id: WebsiteSectionKey; t: ThemeStyle; children: ReactNode; sub?: ReactNode }) {
  const centred = t.heading.includes("center");
  return (
    <div className={cn("mb-8 space-y-3", t.heading)}>
      <h2 id={`${id.toLowerCase()}-heading`} className={cn(t.title, "[font-family:var(--site-heading)]")}>
        {children}
      </h2>
      <span aria-hidden className={cn("block h-1 w-14 rounded-full bg-[var(--site-brand)]", centred && "mx-auto")} />
      {sub && <p className="text-muted-foreground">{sub}</p>}
    </div>
  );
}

function Hero({ site, enquiry }: { site: Site; enquiry: boolean }) {
  const { settings, profile } = site;
  const heading = settings.heroHeading ?? profile.name;
  const image = settings.heroImageFileId ? imageUrl(settings.heroImageFileId) : null;
  const button =
    settings.heroButton === "ENQUIRE" && enquiry
      ? { href: "#enquiry", label: "Enquire about admission" }
      : settings.heroButton === "CALL" && profile.phone
        ? { href: `tel:${profile.phone.replace(/[^\d+]/g, "")}`, label: `Call ${profile.phone}` }
        : null;
  const title = (className: string) => (
    <h1 data-testid="hero-heading" className={cn("[font-family:var(--site-heading)]", className)}>
      {heading}
    </h1>
  );
  const sub = (className: string) => settings.heroSubheading && <p className={cn("max-w-2xl text-lg", className)}>{settings.heroSubheading}</p>;

  if (settings.theme === "MODERN") {
    return (
      <section aria-label="Welcome" className="bg-[color-mix(in_srgb,var(--site-brand)_8%,transparent)]">
        <div className={cn("mx-auto grid w-full max-w-6xl items-center gap-10 px-4 py-16 sm:px-6 sm:py-24", image && "md:grid-cols-2")}>
          <div className="space-y-5">
            {title("text-4xl font-bold tracking-tight sm:text-5xl")}
            {sub("text-muted-foreground")}
            {button && (
              <a href={button.href} className="inline-flex rounded-full bg-[var(--site-brand)] px-6 py-3 font-medium text-[var(--site-on-brand)] shadow-sm hover:opacity-90">
                {button.label}
              </a>
            )}
          </div>
          {image && (
            // eslint-disable-next-line @next/next/no-img-element -- served by the public website-image endpoint
            <img src={image} alt="" className="aspect-[4/3] w-full rounded-3xl object-cover shadow-lg" />
          )}
        </div>
      </section>
    );
  }

  const bold = settings.theme === "BOLD";
  return (
    <section
      aria-label="Welcome"
      className={cn("relative isolate overflow-hidden", bold ? "bg-[var(--site-brand)] text-[var(--site-on-brand)]" : image ? "text-white" : "bg-[color-mix(in_srgb,var(--site-brand)_10%,transparent)]")}
    >
      {image && (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element -- served by the public website-image endpoint */}
          <img src={image} alt="" className="absolute inset-0 -z-20 size-full object-cover" />
          <div aria-hidden className={cn("absolute inset-0 -z-10", bold ? "bg-[color-mix(in_srgb,var(--site-brand)_80%,transparent)]" : "bg-black/55")} />
        </>
      )}
      <div className={cn("mx-auto w-full max-w-6xl space-y-6 px-4 sm:px-6", bold ? "py-20 sm:py-32" : "py-20 text-center sm:py-28")}>
        {title(bold ? "max-w-4xl text-4xl font-extrabold uppercase leading-tight tracking-tight sm:text-6xl" : "text-4xl font-semibold tracking-tight sm:text-5xl")}
        {sub(cn(!bold && "mx-auto", !image && !bold && "text-muted-foreground", bold && "opacity-90"))}
        {button && (
          <a
            href={button.href}
            className={cn(
              "inline-flex px-6 py-3 font-medium shadow-sm hover:opacity-90",
              bold ? "rounded-md bg-[var(--site-on-brand)] text-[var(--site-brand)]" : "rounded-md bg-[var(--site-brand)] text-[var(--site-on-brand)]",
            )}
          >
            {button.label}
          </a>
        )}
      </div>
    </section>
  );
}

function About({ site, t }: { site: Site; t: ThemeStyle }) {
  const { aboutHeading, aboutText, aboutImageFileId } = site.settings;
  return (
    <div className={cn("grid items-center gap-10", aboutImageFileId && "md:grid-cols-2")}>
      <div>
        <SectionHeading id="ABOUT" t={{ ...t, heading: "text-left" }}>
          {aboutHeading ?? `About ${site.profile.shortName ?? site.profile.name}`}
        </SectionHeading>
        {aboutText && <p className="whitespace-pre-line leading-relaxed text-muted-foreground">{aboutText}</p>}
      </div>
      {aboutImageFileId && (
        // eslint-disable-next-line @next/next/no-img-element -- served by the public website-image endpoint
        <img src={imageUrl(aboutImageFileId)} alt="" className={cn("aspect-[4/3] w-full object-cover", site.settings.theme === "MODERN" ? "rounded-3xl md:order-first" : "rounded-lg")} />
      )}
    </div>
  );
}

function Courses({ site, t }: { site: Site; t: ThemeStyle }) {
  return (
    <>
      <SectionHeading id="COURSES" t={t} sub="Our courses, subjects and class times.">
        Courses
      </SectionHeading>
      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {site.courses.map((c) => (
          <article key={c.name} data-testid="public-course" className={cn("space-y-4 p-5", t.card)}>
            <div className="space-y-1">
              <h3 className="text-lg font-semibold [font-family:var(--site-heading)]">{c.name}</h3>
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
                <p className="font-medium">{b.name}</p>
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

/** The admission enquiry form (D22, D129), with the phone number for those who'd rather call. */
function Enquiry({ site, t }: { site: Site; t: ThemeStyle }) {
  const phone = site.profile.phone;
  return (
    <div className="grid gap-10 md:grid-cols-[2fr_3fr]">
      <div>
        <SectionHeading id="ENQUIRY" t={{ ...t, heading: "text-left" }}>
          Admission enquiry
        </SectionHeading>
        <p className="leading-relaxed text-muted-foreground">Tell us who the student is and how to reach you. We&apos;ll call you back about courses, batches and admission.</p>
        {phone && (
          <p className="mt-4">
            Rather talk now?{" "}
            <a href={`tel:${phone.replace(/[^d+]/g, "")}`} className="font-medium text-[var(--site-brand)] hover:underline">
              Call {phone}
            </a>
          </p>
        )}
      </div>
      <EnquiryForm courses={site.courseOptions} card={t.card} />
    </div>
  );
}

/** Public notices (D128): pinned first, then the newest; a long notice opens with "Read more" (no script needed). */
function Notices({ site, t }: { site: Site; t: ThemeStyle }) {
  return (
    <>
      <SectionHeading id="NOTICES" t={t}>
        Notices
      </SectionHeading>
      <ul className="grid gap-4 md:grid-cols-2">
        {site.notices.map((n) => (
          <li key={n.id} data-testid="public-notice" className={cn("space-y-2 p-5", t.card)}>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <time dateTime={n.noticeDate}>{noticeDate(n.noticeDate)}</time>
              {n.pinned && (
                <span className="inline-flex items-center gap-1 rounded-full bg-[color-mix(in_srgb,var(--site-brand)_14%,transparent)] px-2 py-0.5 font-medium text-[var(--site-brand)]">
                  <Pin aria-hidden className="size-3" /> Pinned
                </span>
              )}
            </div>
            <h3 className="text-lg font-semibold [font-family:var(--site-heading)]">{n.title}</h3>
            {n.body.length <= LONG_NOTICE ? (
              <p className="whitespace-pre-line text-sm text-muted-foreground">{n.body}</p>
            ) : (
              <details className="group text-sm text-muted-foreground">
                <summary className="cursor-pointer list-none">
                  <span className="whitespace-pre-line group-open:hidden">{n.body.slice(0, LONG_NOTICE).trimEnd()}… </span>
                  <span className="font-medium text-[var(--site-brand)] group-open:hidden">Read more</span>
                  <span className="hidden font-medium text-[var(--site-brand)] group-open:inline">Show less</span>
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

/** The gallery (D125): photos in the order set, each opening full size. */
function Gallery({ site, t }: { site: Site; t: ThemeStyle }) {
  const rounded = site.settings.theme === "MODERN" ? "rounded-2xl" : site.settings.theme === "BOLD" ? "rounded-sm" : "rounded-lg";
  return (
    <>
      <SectionHeading id="GALLERY" t={t}>
        Gallery
      </SectionHeading>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {site.gallery.map((p) => (
          <li key={p.id}>
            <figure className="space-y-1.5">
              <a href={imageUrl(p.fileId)} target="_blank" rel="noopener" className={cn("block overflow-hidden", rounded)}>
                {/* eslint-disable-next-line @next/next/no-img-element -- served by the public website-image endpoint */}
                <img src={imageUrl(p.fileId)} alt={p.caption ?? ""} loading="lazy" className="aspect-square w-full object-cover transition-transform duration-300 hover:scale-105" />
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
function Testimonials({ site, t }: { site: Site; t: ThemeStyle }) {
  return (
    <>
      <SectionHeading id="TESTIMONIALS" t={t}>
        What our students say
      </SectionHeading>
      <ul className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {site.testimonials.map((q) => (
          <li key={q.id} data-testid="public-testimonial">
            <figure className={cn("flex h-full flex-col gap-4 p-6", t.card)}>
              <Quote aria-hidden className="size-6 text-[var(--site-brand)]" />
              <blockquote className="flex-1 whitespace-pre-line leading-relaxed">{q.quote}</blockquote>
              <figcaption className="flex items-center gap-3">
                {q.photoFileId ? (
                  // eslint-disable-next-line @next/next/no-img-element -- served by the public website-image endpoint
                  <img src={imageUrl(q.photoFileId)} alt="" loading="lazy" className="size-11 rounded-full object-cover" />
                ) : (
                  <span aria-hidden className="flex size-11 items-center justify-center rounded-full bg-[var(--site-brand)] font-semibold text-[var(--site-on-brand)]">
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

function contactsOf({ profile }: Site) {
  return [
    profile.address && { icon: MapPin, text: profile.address },
    profile.phone && { icon: Phone, text: profile.phone, href: `tel:${profile.phone.replace(/[^\d+]/g, "")}` },
    profile.email && { icon: Mail, text: profile.email, href: `mailto:${profile.email}` },
    profile.website && { icon: Globe, text: profile.website, href: /^https?:\/\//.test(profile.website) ? profile.website : `https://${profile.website}` },
  ].filter((c): c is { icon: typeof MapPin; text: string; href?: string } => !!c);
}

/** Contact details and, when there is an address, a Google Maps embed of it (D133). */
function Contact({ site, t }: { site: Site; t: ThemeStyle }) {
  const address = site.profile.address;
  return (
    <>
      <SectionHeading id="CONTACT" t={t}>
        Contact us
      </SectionHeading>
      <div className={cn("grid gap-8", address && "md:grid-cols-[2fr_3fr]")}>
        <ul className="space-y-4">
          {contactsOf(site).map(({ icon: Icon, text, href }) => (
            <li key={text} className="flex items-start gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--site-brand)_14%,transparent)] text-[var(--site-brand)]">
                <Icon aria-hidden className="size-4" />
              </span>
              {href ? (
                <a href={href} className="pt-1.5 break-words hover:underline">
                  {text}
                </a>
              ) : (
                <span className="pt-1.5 whitespace-pre-line">{text}</span>
              )}
            </li>
          ))}
        </ul>
        {address && (
          <div className="space-y-2">
            <iframe
              title={`Map of ${site.profile.name}`}
              src={`https://maps.google.com/maps?q=${encodeURIComponent(address)}&output=embed`}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              className={cn("h-72 w-full border-0", t.card)}
            />
            <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground hover:underline">
              Open in Maps <ExternalLink aria-hidden className="size-3.5" />
            </a>
          </div>
        )}
      </div>
    </>
  );
}
