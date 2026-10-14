import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Parallax } from "../../motion/parallax";
import { FloatingShapes } from "./shapes";
import { imageUrl, mediaClass, telHref, type SectionProps } from "./shared";

// The welcome banner (D131) in the composition of the theme (D136), or another composition chosen in Layout (D135).
// Every variant keeps the same heading, subheading, picture and button; only the arrangement and colours change.

/** How dark the shade over a banner picture is (D135): over a photo, and over a photo tinted in the main colour. */
const SHADE = { LIGHT: "bg-black/30", MEDIUM: "bg-black/50", STRONG: "bg-black/70" } as const;
const TINT = { LIGHT: "bg-[color-mix(in_srgb,var(--site-primary)_65%,transparent)]", MEDIUM: "bg-[color-mix(in_srgb,var(--site-primary)_82%,transparent)]", STRONG: "bg-[color-mix(in_srgb,var(--site-primary)_92%,transparent)]" } as const;

interface HeroParts {
  heading: string;
  sub: string | null;
  image: string | null;
  button: { href: string; label: string } | null;
}

function parts({ site, t }: SectionProps, enquiry: boolean): HeroParts {
  const { settings, profile } = site;
  return {
    heading: settings.heroHeading ?? profile.name,
    sub: settings.heroSubheading,
    image: settings.heroImageFileId ? imageUrl(settings.heroImageFileId) : null,
    button:
      settings.heroButton === "ENQUIRE" && enquiry
        ? { href: "#enquiry", label: t.enquire }
        : settings.heroButton === "CALL" && profile.phone
          ? { href: telHref(profile.phone), label: t.call(profile.phone) }
          : null,
  };
}

const Title = ({ className, children }: { className: string; children: ReactNode }) => (
  <h1 data-testid="hero-heading" className={cn("site-heading site-rise", className)}>
    {children}
  </h1>
);

const Sub = ({ text, className }: { text: string | null; className?: string }) =>
  text ? <p className={cn("site-rise max-w-2xl text-lg leading-relaxed [--d:120ms]", className)}>{text}</p> : null;

const Cta = ({ button }: { button: HeroParts["button"] }) =>
  button && (
    <a href={button.href} className="site-btn site-rise [--d:240ms]">
      {button.label}
    </a>
  );

// eslint-disable-next-line @next/next/no-img-element -- served by the public website-image endpoint
const Img = ({ src, className }: { src: string; className: string }) => <img src={src} alt="" className={className} />;

/** A full-bleed banner picture: it settles in slowly (Ken Burns) and drifts on scroll (D137). */
const Backdrop = ({ src }: { src: string }) => (
  <Parallax className="absolute inset-x-0 -top-[10%] -bottom-[10%] -z-20">
    <Img src={src} className="site-kenburns absolute inset-0 size-full object-cover" />
  </Parallax>
);

const Wrap = ({ className, children }: { className?: string; children: ReactNode }) => <div className={cn("mx-auto w-full max-w-6xl px-4 sm:px-6", className)}>{children}</div>;

/** A coloured banner: its button takes the banner's text colour (website.css `.site-on-colour`). */
const onColour = (bg: string, ink: string) => ({ "--site-banner-bg": bg, "--site-banner-ink": ink }) as CSSProperties;

export function Hero(props: SectionProps & { enquiry: boolean }) {
  const { sig } = props;
  const p = parts(props, props.enquiry);
  const media = mediaClass(sig.media);
  // The region keeps its English name "Welcome" for assistive technology and tests in either language.
  const label = "Welcome";
  const { heroLayout, heroOverlay } = props.site.settings.design;
  const shade = SHADE[heroOverlay];
  const tint = TINT[heroOverlay];

  switch (heroLayout === "THEME" ? sig.hero : heroLayout) {
    case "SPLIT":
      return (
        <section aria-label={label} className="site-tint relative isolate overflow-hidden">
          <FloatingShapes tone="brand" />
          <Wrap className={cn("grid items-center gap-10 py-16 sm:py-24", p.image && "md:grid-cols-2")}>
            <div className="space-y-6">
              <Title className={sig.heroTitle}>{p.heading}</Title>
              <Sub text={p.sub} className="text-muted-foreground" />
              <Cta button={p.button} />
            </div>
            {p.image && <Img src={p.image} className={cn("site-rise aspect-[4/3] w-full object-cover shadow-lg [--d:200ms]", media)} />}
          </Wrap>
        </section>
      );

    case "BANNER":
      return (
        <section aria-label={label} className="site-on-colour relative isolate overflow-hidden bg-[var(--site-primary)] text-[var(--site-on-primary)]" style={onColour("var(--site-primary)", "var(--site-on-primary)")}>
          {p.image && (
            <>
              <Backdrop src={p.image} />
              <div aria-hidden className={cn("absolute inset-0 -z-10", tint)} />
            </>
          )}
          <Wrap className="space-y-6 py-20 sm:py-32">
            <Title className={cn("max-w-4xl", sig.heroTitle)}>{p.heading}</Title>
            <Sub text={p.sub} className="opacity-90" />
            <Cta button={p.button} />
          </Wrap>
        </section>
      );

    case "GRADIENT":
      return (
        <section aria-label={label} className="site-gradient site-on-colour relative isolate overflow-hidden" style={onColour("var(--site-gradient-a)", "var(--site-on-gradient)")}>
          <FloatingShapes tone="on-colour" />
          <Wrap className={cn("grid items-center gap-10 py-20 sm:py-28", p.image && "md:grid-cols-[3fr_2fr]")}>
            <div className="space-y-6">
              <Title className={sig.heroTitle}>{p.heading}</Title>
              <Sub text={p.sub} className="opacity-90" />
              <Cta button={p.button} />
            </div>
            {p.image && <Img src={p.image} className={cn("site-rise aspect-[4/3] w-full rotate-2 object-cover shadow-2xl [--d:200ms]", media)} />}
          </Wrap>
        </section>
      );

    case "MINIMAL":
      return (
        <section aria-label={label}>
          <Wrap className="space-y-8 pt-20 pb-10 sm:pt-28">
            <Title className={cn("max-w-5xl", sig.heroTitle)}>{p.heading}</Title>
            <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
              <Sub text={p.sub} className="text-muted-foreground" />
              <Cta button={p.button} />
            </div>
            {p.image && <Img src={p.image} className={cn("aspect-[21/9] w-full object-cover", media)} />}
          </Wrap>
        </section>
      );

    case "AURORA":
      return (
        <section aria-label={label} className="relative isolate overflow-hidden">
          <FloatingShapes tone="brand" />
          <div aria-hidden className="absolute inset-0 -z-10 [mask-image:linear-gradient(to_bottom,black_60%,transparent)]">
            <div className="site-aurora-blob absolute -top-24 left-[8%] size-[26rem] rounded-full bg-[var(--site-gradient-a)] opacity-35 blur-3xl" />
            <div className="site-aurora-blob absolute top-10 right-[6%] size-[22rem] rounded-full bg-[var(--site-gradient-b)] opacity-30 blur-3xl [animation-delay:-6s]" />
            <div className="site-aurora-blob absolute -bottom-32 left-[38%] size-[24rem] rounded-full bg-[var(--site-accent)] opacity-25 blur-3xl [animation-delay:-12s]" />
          </div>
          <Wrap className="space-y-6 py-20 text-center sm:py-32">
            <Title className={cn("site-gradient-text mx-auto max-w-4xl pb-1", sig.heroTitle)}>{p.heading}</Title>
            <Sub text={p.sub} className="mx-auto text-muted-foreground" />
            <Cta button={p.button} />
            {p.image && <Img src={p.image} className={cn("mx-auto mt-6 aspect-[16/7] w-full max-w-5xl object-cover shadow-2xl", media)} />}
          </Wrap>
        </section>
      );

    case "GLASS":
      return (
        <section aria-label={label} className={cn("relative isolate overflow-hidden", !p.image && "site-gradient")}>
          {p.image && (
            <>
              <Backdrop src={p.image} />
              <div aria-hidden className={cn("absolute inset-0 -z-10", shade)} />
            </>
          )}
          <Wrap className="py-20 sm:py-32">
            <div
              className={cn(
                "site-on-colour mx-auto max-w-3xl space-y-6 rounded-[var(--site-radius)] border border-white/30 bg-white/15 p-8 text-center shadow-2xl backdrop-blur-xl sm:p-12",
                p.image ? "text-white" : "text-[var(--site-on-gradient)]",
              )}
              style={p.image ? onColour("#111827", "#ffffff") : onColour("var(--site-gradient-a)", "var(--site-on-gradient)")}
            >
              <Title className={sig.heroTitle}>{p.heading}</Title>
              <Sub text={p.sub} className="mx-auto opacity-90" />
              <Cta button={p.button} />
            </div>
          </Wrap>
        </section>
      );

    case "BENTO": {
      const name = props.site.profile.shortName ?? props.site.profile.name;
      return (
        <section aria-label={label}>
          <Wrap className="grid gap-4 py-12 sm:py-16 md:grid-cols-3 md:grid-rows-2">
            <div className={cn("site-card flex flex-col justify-center space-y-6 p-8 sm:p-10", p.image ? "md:col-span-2 md:row-span-2" : "md:col-span-3")}>
              <Title className={sig.heroTitle}>{p.heading}</Title>
              <Sub text={p.sub} className="text-muted-foreground" />
              <div>
                <Cta button={p.button} />
              </div>
            </div>
            {p.image && <Img src={p.image} className="site-media aspect-[4/3] size-full object-cover md:aspect-auto" />}
            {p.image && (
              <div aria-hidden className="site-gradient flex items-end rounded-[var(--site-radius)] p-6">
                <span className="site-heading text-2xl font-bold">{name}</span>
              </div>
            )}
          </Wrap>
        </section>
      );
    }

    case "BRUTAL":
      return (
        <section aria-label={label} className="site-on-colour border-b-2 border-foreground bg-[var(--site-accent)] text-[var(--site-on-accent)]" style={onColour("var(--site-accent)", "var(--site-on-accent)")}>
          <Wrap className={cn("grid items-center gap-10 py-16 sm:py-24", p.image && "md:grid-cols-2")}>
            <div className="space-y-6">
              <Title className={sig.heroTitle}>{p.heading}</Title>
              <Sub text={p.sub} />
              <Cta button={p.button} />
            </div>
            {p.image && <Img src={p.image} className="aspect-[4/3] w-full border-2 border-foreground object-cover shadow-[8px_8px_0_var(--foreground)]" />}
          </Wrap>
        </section>
      );

    case "CENTRED":
      return (
        <section aria-label={label} className={cn("relative isolate overflow-hidden", p.image ? "site-on-colour text-white" : "site-tint")} style={p.image ? onColour("#111827", "#ffffff") : undefined}>
          {p.image && (
            <>
              <Backdrop src={p.image} />
              <div aria-hidden className={cn("absolute inset-0 -z-10", shade)} />
            </>
          )}
          <Wrap className="space-y-6 py-20 text-center sm:py-28">
            <Title className={sig.heroTitle}>{p.heading}</Title>
            <Sub text={p.sub} className={cn("mx-auto", !p.image && "text-muted-foreground")} />
            <Cta button={p.button} />
          </Wrap>
        </section>
      );
  }
}
