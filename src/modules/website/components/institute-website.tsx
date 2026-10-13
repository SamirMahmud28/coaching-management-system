import type { ReactNode } from "react";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { WebsiteSectionKey } from "@/server/core/db/schema/website";
import { FONT_FAMILY } from "../fonts";
import { SECTION_LABELS } from "../options";
import { backgroundLayer } from "../patterns";
import { THEMES } from "../themes";
import { siteColours, siteVariables, TEXT_SCALE } from "../tokens";
import { About, Courses, Gallery, Notices, Testimonials } from "./sections/content";
import { Hero } from "./sections/hero";
import { Contact, contactsOf, Enquiry } from "./sections/reach";
import type { SectionProps, Site } from "./sections/shared";
import "../website.css";

// The institute's public website (Website module, D20, D124–D141). Server-rendered; every section is filled from the
// institute's own data and drawn in the theme's composition with the design settings as CSS variables. Sections without
// content are left out, together with their menu link.

export function InstituteWebsite({ site }: { site: Site }) {
  const { settings, profile } = site;
  const { design } = settings;
  const sig = THEMES[settings.theme];
  const style = siteVariables(design, profile.primaryColor, FONT_FAMILY[settings.headingFont], FONT_FAMILY[design.bodyFont]);
  const layer = backgroundLayer(design.background, siteColours(design, profile.primaryColor).primary);
  const props: SectionProps = { site, sig };

  const rendered = settings.sections
    .filter((s) => s.enabled)
    .map((s) => ({ key: s.key, node: renderSection(s.key, props) }))
    .filter((s): s is { key: WebsiteSectionKey; node: ReactNode } => s.node !== null);
  const has = (key: WebsiteSectionKey) => rendered.some((s) => s.key === key);

  return (
    <div
      data-testid="website"
      data-website=""
      data-site-theme={settings.theme.toLowerCase()}
      data-site-button={design.buttonStyle}
      data-site-card={design.cardStyle}
      style={style}
      className={cn("relative isolate flex min-h-screen flex-1 flex-col bg-background text-foreground", design.appearance === "LIGHT" && "theme-light", design.appearance === "DARK" && "dark")}
    >
      {design.textSize !== "MEDIUM" && <style>{`html{font-size:${TEXT_SCALE[design.textSize]}}`}</style>}
      {layer && <div aria-hidden data-testid="site-background" className={cn("pointer-events-none fixed inset-0 -z-10", layer.className)} style={layer.style} />}

      <header className="sticky top-0 z-20 border-b bg-background/85 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center gap-3 px-4 py-3 sm:px-6">
          {profile.hasLogo && (
            // eslint-disable-next-line @next/next/no-img-element -- served by the public logo endpoint
            <img src="/api/public/logo" alt="" className="size-10 rounded-md object-contain" />
          )}
          <a href="#top" className="site-heading min-w-0 flex-1 truncate text-lg font-semibold">
            {profile.shortName ?? profile.name}
          </a>
          <nav aria-label="Sections" className="hidden items-center gap-5 text-sm text-muted-foreground lg:flex">
            {rendered.map((s) => (
              <a key={s.key} href={`#${s.key.toLowerCase()}`} className="hover:text-[var(--site-primary-ink)]">
                {SECTION_LABELS[s.key].nav}
              </a>
            ))}
          </nav>
          {design.appearance === "VISITOR" && <ThemeToggle />}
          <Button asChild variant="outline">
            <a href="/login">Sign in</a>
          </Button>
        </div>
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
  }
}
