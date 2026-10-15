import type { ReactNode } from "react";
import { ArrowRight, Menu } from "lucide-react";
import Link from "next/link";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SECTION_PAGE, type SitePage, type WebsiteSectionKey } from "@/server/modules/website/design";
import { FONT_FAMILY } from "../fonts";
import { SITE_LABELS } from "../i18n";
import { MotionRoot } from "../motion/motion-root";
import { ScrollProgress } from "../motion/parallax";
import { SiteMotion } from "../motion/site-motion";
import { pageHref, pagesOf, resolveLink, sectionHref, sectionsOn } from "../pages";
import { backgroundLayer } from "../patterns";
import { THEMES } from "../themes";
import { siteColours, siteVariables, TEXT_SCALE } from "../tokens";
import { AnnouncementBar } from "./announcement-bar";
import { About, Courses, Gallery, Notices, Testimonials } from "./sections/content";
import { Hero, PageHeading } from "./sections/hero";
import { Contact, Enquiry } from "./sections/reach";
import { Achievers, Faculty, Faqs, Features, Stats, Video } from "./sections/showcase";
import { Ticker } from "./sections/ticker";
import { SocialLinks, type SectionProps, type Site } from "./sections/shared";
import "../website.css";
import "../motion.css";

// The institute's public website (Website module): fixed pages, each server-rendered from the
// institute's own data and drawn in the theme's composition with the design settings as CSS variables, and the
// built-in labels in the site's language. Home shows the banner and the sections marked "On Home"; every other
// page shows its own sections under a heading strip. Sections and pages with nothing to show are left out.

/** Home sections that end with a link to their page; the others are complete where they are. */
const NO_SEE_ALL: WebsiteSectionKey[] = ["STATS", "FEATURES", "ENQUIRY", "CONTACT"];

export function InstituteWebsite({ site, page = "home" }: { site: Site; page?: SitePage }) {
  const { settings, profile } = site;
  const { content, design } = settings;
  const sig = THEMES[settings.theme];
  const t = SITE_LABELS[design.language];
  const style = siteVariables(design, profile.primaryColor, FONT_FAMILY[settings.headingFont], FONT_FAMILY[design.bodyFont]);
  const layer = backgroundLayer(design.background, siteColours(design, profile.primaryColor).primary);
  const props: SectionProps = { site, sig, t };

  const shown = sectionsOn(site, page);
  const pages = pagesOf(site);
  // A long menu needs the wider screens to fit beside the name.
  const wide = pages.length > 7 ? "xl" : "lg";
  const name = profile.shortName ?? profile.name;

  const brand = (
    <Link href="/" prefetch={false} className="site-heading flex min-w-0 items-center gap-3 text-lg font-semibold">
      {profile.hasLogo && (
        // eslint-disable-next-line @next/next/no-img-element -- served by the public logo endpoint
        <img src="/api/public/logo" alt="" className="size-10 shrink-0 rounded-md object-contain" />
      )}
      <span className="truncate">{name}</span>
    </Link>
  );
  const link = (p: SitePage, className: string) => (
    <Link
      key={p}
      href={pageHref(p)}
      prefetch={false}
      aria-current={p === page ? "page" : undefined}
      className={cn(className, "hover:text-[var(--site-primary-ink)] aria-[current=page]:font-semibold aria-[current=page]:text-[var(--site-primary-ink)]")}
    >
      {t.page[p]}
    </Link>
  );
  const nav = (className?: string) => (
    <nav aria-label={t.sectionsNav} className={cn("items-center gap-5 text-sm text-muted-foreground", className)}>
      {pages.map((p) => link(p, ""))}
    </nav>
  );
  // Phones and tablets: the same links in a drop-down that works without any script.
  const phoneMenu = (
    <details className={cn("group relative", wide === "xl" ? "xl:hidden" : "lg:hidden")}>
      <summary aria-label={t.menu} className="flex size-9 cursor-pointer list-none items-center justify-center rounded-md hover:bg-muted [&::-webkit-details-marker]:hidden">
        <Menu aria-hidden className="size-5" />
      </summary>
      <nav aria-label={t.menu} className="absolute right-0 z-30 mt-2 flex w-56 flex-col rounded-[var(--site-radius)] border bg-background p-2 text-sm shadow-xl">
        {pages.map((p) => link(p, "rounded-md px-3 py-2 hover:bg-muted"))}
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
  const announcement = content.announcement;

  return (
    <MotionRoot>
      <div
        data-testid="website"
        data-website=""
        data-site-page={page}
        data-site-motion={design.motion}
        data-site-theme={settings.theme.toLowerCase()}
        data-site-button={design.buttonStyle}
        data-site-card={design.cardStyle}
        data-site-header={design.headerStyle}
        lang={t.lang}
        style={style}
        className={cn("relative isolate flex min-h-screen flex-1 flex-col bg-background text-foreground", design.appearance === "LIGHT" && "theme-light", design.appearance === "DARK" && "dark")}
      >
        {design.textSize !== "MEDIUM" && <style>{`html{font-size:${TEXT_SCALE[design.textSize]}}`}</style>}
        <SiteMotion key={`${page}-${design.motion}`} />
        {design.motion !== "OFF" && <ScrollProgress />}
        {layer && <div aria-hidden data-testid="site-background" className={cn("pointer-events-none fixed inset-0 -z-10", layer.className)} style={layer.style} />}
        {announcement && (
          <AnnouncementBar
            text={announcement.text}
            linkUrl={announcement.linkUrl && resolveLink(site, page, announcement.linkUrl)}
            linkLabel={announcement.linkLabel}
            closeLabel={t.close}
            moreLabel={t.more}
          />
        )}

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
          {page === "home" ? <Hero {...props} enquiryHref={sectionHref(site, page, "ENQUIRY")} /> : <PageHeading {...props} page={page} />}
          {page === "home" && content.showTicker && site.achievers.length > 0 && <Ticker {...props} />}
          {shown.map((key, i) => (
            <section key={key} id={key.toLowerCase()} aria-labelledby={`${key.toLowerCase()}-heading`} data-testid={`section-${key.toLowerCase()}`} className={cn("site-section scroll-mt-20", i % 2 === 1 && sig.band)}>
              <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
                {renderSection(key, props)}
                {page === "home" && !NO_SEE_ALL.includes(key) && (
                  <p className={cn("mt-8", sig.align === "center" ? "text-center" : "text-left")}>
                    <Link href={pageHref(SECTION_PAGE[key])} prefetch={false} data-testid={`see-all-${key.toLowerCase()}`} className="inline-flex items-center gap-1.5 font-semibold text-[var(--site-primary-ink)] hover:underline">
                      {t.seeAll} <ArrowRight aria-hidden className="size-4" />
                    </Link>
                  </p>
                )}
              </div>
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
    </MotionRoot>
  );
}

function renderSection(key: WebsiteSectionKey, props: SectionProps): ReactNode {
  switch (key) {
    case "ABOUT":
      return <About {...props} />;
    case "COURSES":
      return <Courses {...props} />;
    case "CONTACT":
      return <Contact {...props} />;
    case "NOTICES":
      return <Notices {...props} />;
    case "GALLERY":
      return <Gallery {...props} />;
    case "TESTIMONIALS":
      return <Testimonials {...props} />;
    case "ENQUIRY":
      return <Enquiry {...props} />;
    case "STATS":
      return <Stats {...props} />;
    case "FEATURES":
      return <Features {...props} />;
    case "FACULTY":
      return <Faculty {...props} />;
    case "ACHIEVERS":
      return <Achievers {...props} />;
    case "VIDEO":
      return <Video {...props} />;
    case "FAQ":
      return <Faqs {...props} />;
  }
}
