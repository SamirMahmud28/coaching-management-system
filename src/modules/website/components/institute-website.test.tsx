// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_DESIGN, type WebsiteDesign } from "@/server/modules/website/design";
import { DEFAULT_CONTENT, type WebsiteContent } from "@/server/modules/website/site-content";
import { SITE_LABELS, bnDigits } from "../i18n";
import { InstituteWebsite } from "./institute-website";
import type { Site } from "./sections/shared";

// next/font only works inside Next's compiler.
vi.mock("../fonts", () => ({ FONT_FAMILY: new Proxy({}, { get: (_, k) => `font-${String(k)}` }) }));

afterEach(cleanup);

const SECTIONS = ["ABOUT", "COURSES", "NOTICES", "GALLERY", "TESTIMONIALS", "ENQUIRY", "CONTACT"] as const;

function site(design: Partial<WebsiteDesign> = {}, content: Partial<WebsiteContent> = {}): Site {
  return {
    settings: {
      theme: "CLASSIC",
      headingFont: "INTER",
      design: { ...DEFAULT_DESIGN, ...design },
      content: { ...DEFAULT_CONTENT, ...content },
      sections: SECTIONS.map((key) => ({ key, enabled: true })),
      heroHeading: "Bright results",
      heroSubheading: null,
      heroImageFileId: null,
      heroButton: "ENQUIRE",
      aboutHeading: null,
      aboutText: "Since 2012.",
      aboutImageFileId: null,
    },
    profile: { name: "Alo Coaching Centre", shortName: "Alo", address: null, phone: "01711-222333", email: null, website: null, hasLogo: false, primaryColor: "#0f766e" },
    courses: [{ name: "SSC Science", description: null, subjects: ["Physics"], batches: [{ name: "Morning", classes: [{ weekday: "SAT", startsAt: "16:00", endsAt: "17:30", subjectName: "Physics" }] }] }],
    notices: [{ id: "n1", title: "Admission open", body: "Come to the office.", noticeDate: "2026-10-13", pinned: true, showUntil: null }],
    gallery: [{ id: "g1", fileId: "f1", caption: "Prize-giving" }],
    courseOptions: [{ id: "c1", name: "SSC Science" }],
    testimonials: [
      { id: "t1", quote: "Great teachers.", name: "Nabila", line: null, photoFileId: null },
      { id: "t2", quote: "Weekly tests helped.", name: "Rafi", line: null, photoFileId: null },
    ],
  } as unknown as Site;
}

describe("the website's language (D140)", () => {
  it("has every built-in label in Bangla too", () => {
    const keys = (o: object): string[] => Object.entries(o).flatMap(([k, v]) => (v && typeof v === "object" && typeof v !== "function" ? keys(v).map((c) => `${k}.${c}`) : [k]));
    expect(keys(SITE_LABELS.BN).sort()).toEqual(keys(SITE_LABELS.EN).sort());
    expect(bnDigits("16:00–17:30, 2026")).toBe("১৬:০০–১৭:৩০, ২০২৬");
  });

  it("shows the menu, headings, form, times and dates in Bangla, and the office's own words as written", () => {
    render(<InstituteWebsite site={site({ language: "BN" })} />);
    expect(screen.getByTestId("website")).toHaveAttribute("lang", "bn");
    const nav = screen.getByRole("navigation", { name: "বিভাগসমূহ" });
    expect(within(nav).getByRole("link", { name: "ভর্তি" })).toHaveAttribute("href", "#enquiry");
    expect(screen.getByRole("heading", { name: "কোর্সসমূহ" })).toBeInTheDocument();
    expect(screen.getByText("শনি")).toBeInTheDocument();
    expect(screen.getByText(/১৬:০০–১৭:৩০/)).toBeInTheDocument();
    expect(screen.getByText("১৩ অক্টোবর, ২০২৬")).toBeInTheDocument();
    expect(screen.getByLabelText(/শিক্ষার্থীর নাম/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "ভর্তির জন্য যোগাযোগ করুন" })).toBeInTheDocument();
    expect(screen.getByText("Admission open")).toBeInTheDocument(); // the office's notice, untouched
  });

  it("uses the office's own section headings when set", () => {
    render(<InstituteWebsite site={site({}, { sectionTitles: { COURSES: { title: "Our programmes", subtitle: "Pick your batch." } } })} />);
    expect(screen.getByRole("heading", { name: "Our programmes" })).toBeInTheDocument();
    expect(screen.getByText("Pick your batch.")).toBeInTheDocument();
  });
});

describe("layouts and extras (D135, D138)", () => {
  it("lays out notices as a timeline, testimonials in the spotlight and the gallery as a swipe row", () => {
    render(<InstituteWebsite site={site({ noticeLayout: "TIMELINE", testimonialLayout: "SPOTLIGHT", galleryLayout: "CAROUSEL" })} />);
    expect(screen.getByTestId("section-notices").querySelector("ol")).not.toBeNull();
    expect(screen.getAllByTestId("public-testimonial")).toHaveLength(2);
    expect(screen.getByRole("list", { name: "Gallery" })).toHaveClass("snap-x");
  });

  it("shows the announcement bar, social links and the chosen header", () => {
    render(
      <InstituteWebsite
        site={site({ headerStyle: "CENTRED" }, { announcement: { text: "Admission open for HSC 2027", linkUrl: "#enquiry", linkLabel: "Enquire now", showUntil: null }, social: { ...DEFAULT_CONTENT.social, facebook: "https://facebook.com/alo" } })}
      />,
    );
    const bar = screen.getByTestId("announcement");
    expect(bar).toHaveTextContent("Admission open for HSC 2027");
    expect(within(bar).getByRole("link", { name: /Enquire now/ })).toHaveAttribute("href", "#enquiry");
    expect(screen.getAllByRole("link", { name: "Facebook" })[0]).toHaveAttribute("href", "https://facebook.com/alo");
    expect(screen.getByTestId("website")).toHaveAttribute("data-site-header", "CENTRED");
  });

  it("uses another theme's banner when chosen in Layout", () => {
    const { container } = render(<InstituteWebsite site={site({ heroLayout: "GRADIENT" })} />);
    expect(container.querySelector("section[aria-label='Welcome']")).toHaveClass("site-gradient");
  });
});
