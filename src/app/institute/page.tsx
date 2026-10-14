import type { Metadata } from "next";
import { Globe, Mail, MapPin, Phone } from "lucide-react";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DAY_NAME } from "@/modules/institute/components/portal/week-schedule";
import { db } from "@/server/core/db/client";
import { getCurrentInstitute } from "@/server/modules/institute/current-user";
import { InstituteWebsite } from "@/modules/website/components/institute-website";
import { getPublicCatalog, publicPageVisible } from "@/server/modules/portal/service";
import { websiteMetadata } from "@/modules/website/metadata";
import { loadPublicWebsite } from "@/server/modules/website/load";

export async function generateMetadata(): Promise<Metadata> {
  const institute = await getCurrentInstitute();
  if (!publicPageVisible(institute.status)) return { title: "Not available" };
  const site = await loadPublicWebsite(institute.id);
  return site ? websiteMetadata(site, "home") : { title: institute.name };
}

// The institute's public page. With the Website module on, its themed website's Home (D20, D124–D147); otherwise the basic
// Core page (D21): default theme, profile and contact details, and active courses with their batches' class times (D59).
export default async function InstitutePublicPage() {
  const institute = await getCurrentInstitute();
  if (!publicPageVisible(institute.status)) {
    return (
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center gap-2 px-6 py-24 text-center">
        <h1 className="text-2xl font-semibold">This page isn&apos;t available</h1>
        <p className="text-muted-foreground">Please contact the institute directly.</p>
      </main>
    );
  }
  const site = await loadPublicWebsite(institute.id);
  if (site) return <InstituteWebsite site={site} page="home" />;

  const { profile, courses } = await getPublicCatalog(db, institute.id);
  const contacts = [
    profile.address && { icon: MapPin, text: profile.address },
    profile.phone && { icon: Phone, text: profile.phone, href: `tel:${profile.phone.replace(/[^\d+]/g, "")}` },
    profile.email && { icon: Mail, text: profile.email, href: `mailto:${profile.email}` },
    profile.website && { icon: Globe, text: profile.website, href: /^https?:\/\//.test(profile.website) ? profile.website : `https://${profile.website}` },
  ].filter((c): c is { icon: typeof MapPin; text: string; href?: string } => !!c);

  return (
    <div className="flex min-h-screen flex-1 flex-col">
      <div className="h-1 bg-brand-gradient" style={profile.primaryColor ? { background: profile.primaryColor } : undefined} aria-hidden />
      <header className="mx-auto flex w-full max-w-5xl items-center gap-3 px-4 py-4 sm:px-6">
        {profile.hasLogo && (
          // eslint-disable-next-line @next/next/no-img-element -- served by the public logo endpoint
          <img src="/api/public/logo" alt="" className="size-10 rounded-md object-contain" />
        )}
        <p className="min-w-0 flex-1 truncate text-lg font-semibold">{profile.shortName ?? profile.name}</p>
        <ThemeToggle />
        <Button asChild>
          <a href="/login">Sign in</a>
        </Button>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 space-y-10 px-4 pt-8 pb-16 sm:px-6">
        <section className="space-y-4">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{profile.name}</h1>
          {contacts.length > 0 && (
            <ul className="flex flex-col gap-2 text-sm text-muted-foreground sm:flex-row sm:flex-wrap sm:gap-x-6">
              {contacts.map(({ icon: Icon, text, href }) => (
                <li key={text} className="flex items-center gap-2">
                  <Icon aria-hidden className="size-4 shrink-0" />
                  {href ? (
                    <a href={href} className="hover:text-foreground hover:underline">
                      {text}
                    </a>
                  ) : (
                    <span>{text}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="space-y-4" aria-labelledby="courses-heading">
          <h2 id="courses-heading" className="text-xl font-semibold">
            Courses
          </h2>
          {courses.length === 0 ? (
            <p className="text-muted-foreground">Courses will be listed here soon.</p>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {courses.map((c) => (
                <Card key={c.name} data-testid="public-course">
                  <CardHeader>
                    <CardTitle>{c.name}</CardTitle>
                    {c.description && <CardDescription className="whitespace-pre-line">{c.description}</CardDescription>}
                  </CardHeader>
                  <CardContent className="space-y-4 text-sm">
                    {c.subjects.length > 0 && (
                      <p>
                        <span className="text-muted-foreground">Subjects: </span>
                        {c.subjects.join(", ")}
                      </p>
                    )}
                    {c.batches.map((b) => (
                      <div key={b.name} className="space-y-1">
                        <p className="font-medium">{b.name}</p>
                        {b.classes.length === 0 ? (
                          <p className="text-muted-foreground">Class times to be announced</p>
                        ) : (
                          <ul className="space-y-0.5 text-muted-foreground">
                            {b.classes.map((cl, i) => (
                              <li key={i}>
                                {DAY_NAME[cl.weekday]} {cl.startsAt}–{cl.endsAt} · {cl.subjectName}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    ))}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
