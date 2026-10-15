import { ExternalLink, Globe, Mail, MapPin, Phone } from "lucide-react";
import { cn } from "@/lib/utils";
import { EnquiryForm } from "../enquiry-form";
import { SectionHeading, sectionWords, telHref, type SectionProps, type Site } from "./shared";

// How visitors reach the institute: the admission enquiry form and contact details with a map, with
// the labels in the site's language.

export function Enquiry(props: SectionProps) {
  const { site, sig, t } = props;
  const words = sectionWords(props, "ENQUIRY");
  const phone = site.profile.phone;
  return (
    <div className="grid gap-10 md:grid-cols-[2fr_3fr]">
      <div>
        <SectionHeading id="ENQUIRY" sig={sig} align="left">
          {words.title}
        </SectionHeading>
        <p className="leading-relaxed text-muted-foreground">{words.subtitle ?? t.enquiryIntro}</p>
        {phone && (
          <p className="mt-4">
            {t.ratherTalk}{" "}
            <a href={telHref(phone)} className="font-medium text-[var(--site-primary-ink)] hover:underline">
              {t.call(phone)}
            </a>
          </p>
        )}
      </div>
      <EnquiryForm courses={site.courseOptions} card="site-card" labels={t.enquiry} />
    </div>
  );
}

export function contactsOf({ profile }: Site, t?: SectionProps["t"]) {
  const num = t?.num ?? ((x: string) => x);
  return [
    profile.address && { icon: MapPin, text: profile.address },
    profile.phone && { icon: Phone, text: num(profile.phone), href: telHref(profile.phone) },
    profile.email && { icon: Mail, text: profile.email, href: `mailto:${profile.email}` },
    profile.website && { icon: Globe, text: profile.website, href: /^https?:\/\//.test(profile.website) ? profile.website : `https://${profile.website}` },
  ].filter((c): c is { icon: typeof MapPin; text: string; href?: string } => !!c);
}

/** Contact details and, when there is an address, a Google Maps embed of it. */
export function Contact(props: SectionProps) {
  const { site, sig, t } = props;
  const words = sectionWords(props, "CONTACT");
  const address = site.profile.address;
  return (
    <>
      <SectionHeading id="CONTACT" sig={sig} sub={words.subtitle}>
        {words.title}
      </SectionHeading>
      <div className={cn("grid gap-8", address && "md:grid-cols-[2fr_3fr]")}>
        <ul className="space-y-4">
          {contactsOf(site, t).map(({ icon: Icon, text, href }) => (
            <li key={text} className="flex items-start gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--site-primary)_14%,transparent)] text-[var(--site-primary-ink)]">
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
              title={t.mapOf(site.profile.name)}
              src={`https://maps.google.com/maps?q=${encodeURIComponent(address)}&output=embed`}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              className="site-card h-72 w-full border-0"
            />
            <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground hover:underline">
              {t.openInMaps} <ExternalLink aria-hidden className="size-3.5" />
            </a>
          </div>
        )}
      </div>
    </>
  );
}
