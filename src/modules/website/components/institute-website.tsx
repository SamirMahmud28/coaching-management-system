import type { ReactNode } from "react";
import { Menu } from "lucide-react";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { WebsiteSectionKey } from "@/server/core/db/schema/website";
import { FONT_FAMILY } from "../fonts";
import { SITE_LABELS } from "../i18n";
import { backgroundLayer } from "../patterns";
import { THEMES } from "../themes";
import { siteColours, siteVariables, TEXT_SCALE } from "../tokens";
import { AnnouncementBar } from "./announcement-bar";
import { About, Courses, Gallery, Notices, Testimonials } from "./sections/content";
import { Hero } from "./sections/hero";
import { Contact, contactsOf, Enquiry } from "./sections/reach";
import { Achievers, Faculty, Faqs, Features, Stats, Video } from "./sections/showcase";
import { SocialLinks, type SectionProps, type Site } from "./sections/shared";
import "../website.css";

// The institute's public website (Website module, D20, D124–D141). Server-rendered; every section is filled from the
// institute's own data and drawn in the theme's composition with the design settings as CSS variables, with the
// built-in labels in the site's language. Sections without content are left out, together with their menu link.

/** Sections that sit between others without a menu link of their own, so the menu stays short. */
const NOT_IN_MENU: WebsiteSectionKey[] = ["STATS", "FEATURES", "VIDEO"];

export function InstituteWebsite({ site }: { site: Site }) {
  const { settings, profile } = site;
  const { content } = settings;
  const { design } = settings;
  const sig = THEMES[settings.theme];
  const t = SITE_LABELS[design.language];
  const style = siteVariables(design, profile.primaryColor, FONT_FAMILY[settings.headingFont], FONT_FAMILY[design.bodyFont]);
  const layer = backgroundLayer(design.background, siteColours(design, profile.primaryColor).primary);
  const props: SectionProps = { site, sig, t };

  const rendered = settings.sections
    .filter((s) => s.enabled)
    .map((s) => ({ key: s.key, node: renderSection(s.key, props) }))
    .filter((s): s is { key: WebsiteSectionKey; node: ReactNode } => s.node !== null);
  const has = (key: WebsiteSectionKey) => rendered.some((s) => s.key === key);
  const menu = rendered.filter((s) => !NOT_IN_MENU.includes(s.key));
  // A long menu needs the wider screens to fit beside the name.
  const wide = menu.length > 7 ? "xl" : "lg";
  const name = profile.shortName ?? profile.name;

  const brand = (
    <a href="#top" className="site-heading flex min-w-0 items-center gap-3 text-lg font-semibold">
      {profile.hasLogo && (
        // eslint-disable-next-line @next/next/no-img-element -- served by the public logo endpoint
        <img src="/api/public/logo" alt="" className="size-10 shrink-0 rounded-md object-contain" />
      )}
      <span className="truncate">{name}</span>
    </a>
  );
  const nav = (className?: string) => (
    <nav aria-label={t.sectionsNav} className={cn("items-center gap-5 text-sm text-muted-foreground", className)}>
      {menu.map((s) => (
        <a key={s.key} href={`#${s.key.toLowerCase()}`} className="hover:text-[var(--site-primary-ink)]">
          {t.nav[s.key]}
        </a>
      ))}
    </nav>
  );
  // Phones and tablets: the same links in a drop-down that works without any script.
  const phoneMenu = menu.length > 0 && (
    <details className={cn("group relative", wide === "xl" ? "xl:hidden" : "lg:hidden")}>
      <summary aria-label={t.menu} className="flex size-9 cursor-pointer list-none items-center justify-center rounded-md hover:bg-muted [&::-webkit-details-marker]:hidden">
        <Menu aria-hidden className="size-5" />
      </summary>
      <nav aria-label={t.menu} className="absolute right-0 z-30 mt-2 flex w-56 flex-col rounded-[var(--site-radius)] border bg-background p-2 text-sm shadow-xl">
        {menu.map((s) => (
          <a key={s.key} href={`#${s.key.toLowerCase()}`} className="rounded-md px-3 py-2 hover:bg-muted hover:text-[var(--site-primary-ink)]">
            {t.nav[s.key]}
          </a>
        ))}
      </nav>
    </details>
  );
  const actions = (
    <div className="flex shrink-0 items-center gap-2">
      {phoneMenu}
      <SocialLinks site={site} className="hidden xl:flex" />
      {design.appearance === "VISITOR" && <ThemeToggle />}
      <Button asChild variant="outline">
        <a href="/login">{t.signIn}</a>
      </Button>
    </div>
  );

  return (
    <div
      data-testid="website"
      data-website=""
      data-site-theme={settings.theme.toLowerCase()}
      data-site-button={design.buttonStyle}
      data-site-card={design.cardStyle}
      data-site-header={design.headerStyle}
      lang={t.lang}
      style={style}
      className={cn("relative isolate flex min-h-screen flex-1 flex-col bg-background text-foreground", design.appearance === "LIGHT" && "theme-light", design.appearance === "DARK" && "dark")}
    >
      {design.textSize !== "MEDIUM" && <style>{`html{font-size:${TEXT_SCALE[design.textSize]}}`}</style>}
      {layer && <div aria-hidden data-testid="site-background" className={cn("pointer-events-none fixed inset-0 -z-10", layer.className)} style={layer.style} />}
      {content.announcement && <AnnouncementBar text={content.announcement.text} linkUrl={content.announcement.linkUrl} linkLabel={content.announcement.linkLabel} closeLabel={t.close} moreLabel={t.more} />}

      <header
        className={cn(
          "sticky top-0 z-20",
          design.headerStyle === "GLASS" ? "border-b border-white/10 bg-background/55 backdrop-blur-xl backdrop-saturate-150" : "border-b bg-background/85 backdrop-blur",
        )}
      >
        {design.headerStyle === "CENTRED" ? (
          <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
            <div className="flex items-center gap-3 py-3 lg:justify-center">
              <div className="min-w-0 flex-1 lg:flex lg:flex-none lg:justify-center">{brand}</div>
              <div className="lg:hidden">{actions}</div>
            </div>
            <div className="hidden items-center justify-between border-t py-2 lg:flex">
              <SocialLinks site={site} />
              {nav("flex")}
              <div className="flex items-center gap-2">
                {design.appearance === "VISITOR" && <ThemeToggle />}
                <Button asChild variant="outline" size="sm">
                  <a href="/login">{t.signIn}</a>
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="mx-auto flex w-full max-w-6xl items-center gap-3 px-4 py-3 sm:px-6">
            <div className="min-w-0 flex-1">{brand}</div>
            {nav(wide === "xl" ? "hidden xl:flex" : "hidden lg:flex")}
            {actions}
          </div>
        )}
      </header>

      <main id="top" className="flex-1">
        <Hero {...props} enquiry={has("ENQUIRY")} />
        {rendered.map((s, i) => (
          <section key={s.key} id={s.key.toLowerCase()} aria-labelledby={`${s.key.toLowerCase()}-heading`} data-testid={`section-${s.key.toLowerCase()}`} className={cn("site-section scroll-mt-20", i % 2 === 1 && sig.band)}>
            <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">{s.node}</div>
          </section>
        ))}
      </main>

      <footer className="border-t py-8 text-sm text-muted-foreground">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>
            © {t.num(String(new Date().getFullYear()))} {profile.name}
          </p>
          <SocialLinks site={site} />
          <a href="/login" className="hover:text-foreground hover:underline">
            {t.staffSignIn}
          </a>
        </div>
      </footer>
    </div>
  );
}

function renderSection(key: WebsiteSectionKey, props: SectionProps): ReactNode | null {
  const s = props.site;
  switch (key) {
    case "ABOUT":
      return s.settings.aboutText || s.settings.aboutImageFileId ? <About {...props} /> : null;
    case "COURSES":
      return s.courses.length ? <Courses {...props} /> : null;
    case "CONTACT":
      return contactsOf(s).length ? <Contact {...props} /> : null;
    case "NOTICES":
      return s.notices.length ? <Notices {...props} /> : null;
    case "GALLERY":
      return s.gallery.length ? <Gallery {...props} /> : null;
    case "TESTIMONIALS":
      return s.testimonials.length ? <Testimonials {...props} /> : null;
    case "ENQUIRY":
      return <Enquiry {...props} />;
    case "STATS":
      return s.settings.content.stats.length ? <Stats {...props} /> : null;
    case "FEATURES":
      return s.settings.content.features.length ? <Features {...props} /> : null;
    case "FACULTY":
      return s.faculty.length ? <Faculty {...props} /> : null;
    case "ACHIEVERS":
      return s.achievers.length ? <Achievers {...props} /> : null;
    case "VIDEO":
      return s.settings.content.video ? <Video {...props} /> : null;
    case "FAQ":
      return s.settings.content.faqs.length ? <Faqs {...props} /> : null;
  }
}
