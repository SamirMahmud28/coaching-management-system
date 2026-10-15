// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_DESIGN, WEBSITE_SECTIONS, type WebsiteDesign } from "@/server/modules/website/design";
import { DEFAULT_CONTENT, type WebsiteContent } from "@/server/modules/website/site-content";
import { SITE_LABELS, bnDigits } from "../i18n";
import { InstituteWebsite } from "./institute-website";
import type { Site } from "./sections/shared";

// next/font only works inside Next's compiler.
vi.mock("../fonts", () => ({ FONT_FAMILY: new Proxy({}, { get: (_, k) => `font-${String(k)}` }) }));

afterEach(cleanup);

function site(design: Partial<WebsiteDesign> = {}, content: Partial<WebsiteContent> = {}): Site {
  return {
    settings: {
      theme: "CLASSIC",
      headingFont: "INTER",
      design: { ...DEFAULT_DESIGN, ...design },
      content: { ...DEFAULT_CONTENT, ...content },
      // Everything on Home, so one render shows every section; the page tests below narrow it down.
      sections: WEBSITE_SECTIONS.map((key) => ({ key, enabled: true, onHome: true })),
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
    faculty: [],
    achievers: [],
  } as unknown as Site;
}

describe("the website's language", () => {
  it("has every built-in label in Bangla too", () => {
    const keys = (o: object): string[] => Object.entries(o).flatMap(([k, v]) => (v && typeof v === "object" && typeof v !== "function" ? keys(v).map((c) => `${k}.${c}`) : [k]));
    expect(keys(SITE_LABELS.BN).sort()).toEqual(keys(SITE_LABELS.EN).sort());
    expect(bnDigits("16:00–17:30, 2026")).toBe("১৬:০০–১৭:৩০, ২০২৬");
  });

  it("shows the menu, headings, form, times and dates in Bangla, and the office's own words as written", () => {
    render(<InstituteWebsite site={site({ language: "BN" })} />);
    expect(screen.getByTestId("website")).toHaveAttribute("lang", "bn");
    const nav = screen.getByRole("navigation", { name: "পাতাসমূহ" });
    expect(within(nav).getByRole("link", { name: "ভর্তি" })).toHaveAttribute("href", "/admission");
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

describe("layouts and extras", () => {
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

describe("showcase sections", () => {
  it("shows stats, reasons, faculty, achievers, the video and questions, each only when filled", () => {
    const filled = site(
      { faqLayout: "TWO_COLUMN" },
      {
        stats: [{ value: 1200, suffix: "+", label: "Students taught" }],
        features: [{ icon: "Users", title: "Small batches", text: "At most 25." }],
        faqs: [{ question: "When does admission open?", answer: "In January." }],
        videos: [{ youtubeId: "dQw4w9WgXcQ", title: "Our classrooms" }],
      },
    );
    filled.faculty = [{ id: "f1", name: "Rahim Uddin", photoFileId: null, line: "BUET", subjects: ["Physics"] }];
    filled.achievers = [{ id: "a1", name: "Nusrat", result: "GPA 5.00", exam: "SSC 2025", photoFileId: null }];
    render(<InstituteWebsite site={filled} />);

    expect(screen.getByTestId("public-stat")).toHaveTextContent("1,200+Students taught");
    expect(screen.getByTestId("public-feature")).toHaveTextContent("Small batches");
    expect(screen.getByTestId("public-faculty")).toHaveTextContent("Rahim UddinPhysicsBUET");
    expect(screen.getByTestId("public-achiever")).toHaveTextContent("GPA 5.00");
    expect(screen.getByTestId("public-faq").querySelector("details")).not.toBeNull();
    // The video is only a picture and a button until it is played.
    expect(screen.getByRole("button", { name: "Play video: Our classrooms" })).toBeInTheDocument();
    expect(screen.getByTestId("section-video").querySelector("iframe")).toBeNull();
    // Stats, reasons and the video sit between other sections without a menu link.
    const nav = screen.getByRole("navigation", { name: "Pages" });
    expect(within(nav).getByRole("link", { name: "Teachers" })).toHaveAttribute("href", "/teachers");
    expect(within(nav).getByRole("link", { name: "Results" })).toHaveAttribute("href", "/results");
  });

  it("leaves the showcase sections out while they are empty", () => {
    render(<InstituteWebsite site={site()} />);
    for (const key of ["stats", "features", "faculty", "achievers", "video", "faq"]) expect(screen.queryByTestId(`section-${key}`)).toBeNull();
  });

  it("writes the stats in Bangla digits on a Bangla site", () => {
    render(<InstituteWebsite site={site({ language: "BN" }, { stats: [{ value: 1200, suffix: "+", label: "শিক্ষার্থী" }] })} />);
    expect(screen.getByTestId("public-stat")).toHaveTextContent("১,২০০+");
  });
});

describe("pages", () => {
  /** The default Home set, as a new site gets it. */
  const homeDefault = (o: Partial<WebsiteDesign> = {}) => {
    const sample = site(o, { stats: [{ value: 1200, suffix: "+", label: "Students" }], faqs: [{ question: "When?", answer: "January." }] });
    sample.settings.sections = WEBSITE_SECTIONS.map((key) => ({ key, enabled: true, onHome: ["STATS", "FEATURES", "COURSES", "ACHIEVERS", "TESTIMONIALS", "ENQUIRY"].includes(key) }));
    return sample;
  };

  it("shows the banner and only the On Home sections on Home, each list with a link to its page", () => {
    render(<InstituteWebsite site={homeDefault()} page="home" />);
    expect(screen.getByTestId("hero-heading")).toBeInTheDocument();
    expect(screen.getByTestId("section-courses")).toBeInTheDocument();
    expect(screen.getByTestId("section-enquiry")).toBeInTheDocument();
    expect(screen.queryByTestId("section-gallery")).toBeNull();
    expect(screen.queryByTestId("section-about")).toBeNull();
    expect(screen.getByTestId("see-all-courses")).toHaveAttribute("href", "/courses");
    expect(screen.getByTestId("see-all-testimonials")).toHaveAttribute("href", "/results");
    expect(screen.queryByTestId("see-all-enquiry")).toBeNull();
    // The banner's Enquire button stays on Home while the form is there.
    expect(screen.getByRole("link", { name: "Enquire about admission" })).toHaveAttribute("href", "#enquiry");
  });

  it("shows a page's own sections under a heading strip, and marks it in the menu", () => {
    render(<InstituteWebsite site={homeDefault()} page="admission" />);
    expect(screen.queryByTestId("hero-heading")).toBeNull();
    expect(screen.getByTestId("page-heading")).toHaveTextContent("Admission");
    expect(screen.getByTestId("section-enquiry")).toBeInTheDocument();
    expect(screen.getByTestId("section-faq")).toBeInTheDocument();
    expect(screen.queryByTestId("section-courses")).toBeNull();
    expect(screen.getByRole("navigation", { name: "Pages" }).querySelector("[aria-current=page]")).toHaveTextContent("Admission");
  });

  it("lists only pages with something to show, and points old in-page links at a section's page", () => {
    const sample = homeDefault();
    sample.settings.sections = sample.settings.sections.map((x) => (x.key === "ENQUIRY" ? { ...x, onHome: false } : x));
    sample.settings.content.announcement = { text: "Admission open", linkUrl: "#enquiry", linkLabel: "Enquire", showUntil: null };
    sample.faculty = [];
    render(<InstituteWebsite site={sample} page="home" />);
    const nav = screen.getByRole("navigation", { name: "Pages" });
    expect(within(nav).queryByRole("link", { name: "Teachers" })).toBeNull(); // no faculty yet
    expect(within(nav).getByRole("link", { name: "Gallery" })).toBeInTheDocument();
    expect(within(screen.getByTestId("announcement")).getByRole("link", { name: /Enquire/ })).toHaveAttribute("href", "/admission#enquiry");
    expect(screen.getByRole("link", { name: "Enquire about admission" })).toHaveAttribute("href", "/admission#enquiry");
  });
});

describe("motion strength", () => {
  const banner = (motion: WebsiteDesign["motion"]) => {
    const sample = site({ motion, heroLayout: "SPLIT" });
    return sample;
  };
  it("draws the 3D shapes at Normal, more at Lively, and none at Subtle or Off", () => {
    const count = (motion: WebsiteDesign["motion"]) => {
      const { container, unmount } = render(<InstituteWebsite site={banner(motion)} />);
      const n = container.querySelectorAll(".site-shape").length;
      expect(container.querySelector("[data-website]")).toHaveAttribute("data-site-motion", motion);
      unmount();
      return n;
    };
    expect(count("NORMAL")).toBe(5);
    expect(count("LIVELY")).toBe(7);
    expect(count("SUBTLE")).toBe(0);
    expect(count("OFF")).toBe(0);
  });

  it("has no scroll-progress bar when motion is Off", () => {
    render(<InstituteWebsite site={banner("OFF")} />);
    expect(screen.queryByTestId("scroll-progress")).toBeNull();
  });
});

describe("banner slider, toppers ticker and video gallery", () => {
  it("turns the banner into a slider with one main heading, dots and arrows", () => {
    const sample = site({}, { heroSlides: [{ imageFileId: "s1", heading: "Admission open", subheading: null }, { imageFileId: "s2", heading: null, subheading: "Weekly tests" }] });
    render(<InstituteWebsite site={sample} />);
    const slider = screen.getByTestId("hero-slider");
    expect(within(slider).getAllByRole("group", { hidden: true })).toHaveLength(3);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByTestId("hero-heading")).toHaveTextContent("Bright results");
    expect(within(slider).getByRole("button", { name: "Slide 2 of 3" })).toBeInTheDocument();
    expect(within(slider).getByRole("button", { name: "Next" })).toBeInTheDocument();
    expect(within(slider).getAllByRole("group", { hidden: true })[1]).toHaveAttribute("aria-hidden", "true");
  });

  it("shows the toppers ticker on Home only when switched on and there are achievers", () => {
    const sample = site({}, { showTicker: true });
    render(<InstituteWebsite site={sample} />);
    expect(screen.queryByTestId("toppers-ticker")).toBeNull(); // no achievers yet
    cleanup();
    sample.achievers = [{ id: "a1", name: "Nusrat", result: "GPA 5.00", exam: "SSC 2025", photoFileId: null }];
    render(<InstituteWebsite site={sample} />);
    expect(screen.getByTestId("toppers-ticker")).toHaveTextContent("NusratGPA 5.00SSC 2025");
    cleanup();
    render(<InstituteWebsite site={sample} page="results" />);
    expect(screen.queryByTestId("toppers-ticker")).toBeNull();
  });

  it("shows several videos as a grid of players that load on tap", () => {
    const sample = site({}, { videos: [{ youtubeId: "dQw4w9WgXcQ", title: "Tour" }, { youtubeId: "aaaaaaaaaaa", title: null }] });
    render(<InstituteWebsite site={sample} page="gallery" />);
    expect(screen.getAllByTestId("public-video")).toHaveLength(2);
    expect(screen.getByTestId("section-video").querySelector("iframe")).toBeNull();
  });
});
