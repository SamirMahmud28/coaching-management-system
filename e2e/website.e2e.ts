import { expect, test, type Page } from "@playwright/test";
import sharp from "sharp";
import { clearRateLimits, instituteUrl, seedInstitute, seedTeaching, setInstituteModules, setInstituteProfile } from "./helpers";

// One serial story for the Website module; each milestone (W1–W3, then Website Pro W5–W9) adds its steps.
test.describe.configure({ mode: "serial" });

const INSTITUTE = {
  name: "Prottasha Coaching",
  subdomain: "prottasha",
  ownerName: "Rumana Islam",
  ownerEmail: "owner@prottasha.test",
  password: "TempPass12",
  modules: ["website"],
};
const OWNER_PASSWORD = "OwnerChosen123";
const url = (path: string) => instituteUrl(INSTITUTE.subdomain, path);

async function signIn(page: Page, email: string, password: string) {
  await clearRateLimits();
  await page.goto(url("/login"));
  await page.getByLabel("Email, mobile number or student ID").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

async function signInAsOwner(page: Page) {
  await signIn(page, INSTITUTE.ownerEmail, OWNER_PASSWORD);
  await expect(page).toHaveURL(url("/app"));
}

const picture = async () => ({
  name: "campus.jpg",
  mimeType: "image/jpeg",
  buffer: await sharp({ create: { width: 1200, height: 600, channels: 3, background: "#2a6f4e" } }).jpeg().toBuffer(),
});

test.beforeAll(async () => {
  await seedInstitute(INSTITUTE);
  await setInstituteProfile(INSTITUTE.subdomain, { address: "House 12, Road 3, Mirpur 10, Dhaka", phone: "01711-222333", primaryColor: "#7c3aed" });
  await seedTeaching({ subdomain: INSTITUTE.subdomain, instructor: { fullName: "Kamal Uddin", email: "kamal@prottasha.test", password: "TeachPass12" }, subjects: ["Physics", "Chemistry"], students: ["Nabila Hossain"] });
});

test("the Owner signs in for the first time", async ({ page }) => {
  await signIn(page, INSTITUTE.ownerEmail, INSTITUTE.password);
  await page.getByLabel("Current (temporary) password").fill(INSTITUTE.password);
  await page.getByLabel("New password", { exact: true }).fill(OWNER_PASSWORD);
  await page.getByLabel("Confirm new password").fill(OWNER_PASSWORD);
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(page).toHaveURL(url("/app"));
});

test("before any edit, the website shows the institute's name and its courses (D21, D131)", async ({ page }) => {
  await page.goto(url("/"));
  await expect(page.getByTestId("website")).toHaveAttribute("data-site-theme", "classic");
  await expect(page.getByTestId("hero-heading")).toHaveText(INSTITUTE.name);
  await expect(page.getByTestId("section-courses")).toContainText("SSC Science");
  await expect(page.getByTestId("section-about")).toHaveCount(0); // nothing written yet
});

test("W1 + W5: the Owner designs the website and it is public at once (D124, D126, D131, D133, D135, D136)", async ({ page }) => {
  await signInAsOwner(page);
  await page.getByRole("link", { name: "Website", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Website" })).toBeVisible();

  // Look: a theme brings its own fonts and shapes; colours, background and appearance are then set by hand.
  await page.getByRole("radio", { name: /^Bold/ }).click();
  await expect(page.getByText("Fonts, shapes and background now follow Bold.")).toBeVisible();
  await expect(page.getByLabel("Heading font")).toContainText("Montserrat");
  await page.getByLabel("Heading font").click();
  await page.getByRole("option", { name: /Poppins/ }).click();
  await page.getByRole("radio", { name: "Jamdani" }).click();
  await page.getByRole("radio", { name: "Ember" }).click();
  await page.getByRole("radiogroup", { name: "Buttons" }).getByRole("radio", { name: /Gradient/ }).click();
  await page.getByRole("radiogroup", { name: "Cards" }).getByRole("radio", { name: /Frosted glass/ }).click();
  await page.getByRole("radiogroup", { name: "Background" }).getByRole("radio", { name: /Nakshi Kantha/ }).click();
  await page.getByRole("radio", { name: /Always dark/ }).click();

  await page.getByRole("tab", { name: "Content" }).click();
  await page.getByLabel("Heading", { exact: true }).first().fill("Your path to GPA 5");
  await page.getByLabel("Line under the heading").fill("SSC and HSC coaching in Mirpur since 2010");
  await page.locator("#hero_image").setInputFiles(await picture());
  await expect(page.getByRole("img", { name: "Welcome banner picture" })).toBeVisible();
  await page.getByLabel("Button", { exact: true }).click();
  await page.getByRole("option", { name: /^Call/ }).click();
  await page.getByLabel("Text", { exact: true }).fill("Small batches, weekly tests and caring teachers.");
  await page.getByRole("tab", { name: "Sections" }).click();
  await page.getByLabel("Show Courses & batches", { exact: true }).click();
  await page.getByRole("button", { name: "Move Contact & map up" }).click();
  await page.getByRole("button", { name: "Save website" }).click();
  await expect(page.getByText("Website saved. It's public now.")).toBeVisible();

  await page.goto(url("/"));
  const site = page.getByTestId("website");
  await expect(site).toHaveAttribute("data-site-theme", "bold");
  await expect(site).toHaveAttribute("data-site-button", "GRADIENT");
  await expect(site).toHaveAttribute("data-site-card", "GLASS");
  await expect(site).toHaveClass(/(^| )dark( |$)/);
  expect(await site.evaluate((el) => getComputedStyle(el).getPropertyValue("--site-primary").trim())).toBe("#1e3a5f");
  await expect(page.getByTestId("site-background")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Change theme" })).toHaveCount(0); // fixed dark: no switch
  await expect(page.getByTestId("hero-heading")).toHaveText("Your path to GPA 5");
  await expect(page.getByRole("region", { name: "Welcome" }).getByRole("link", { name: "Call 01711-222333" })).toHaveAttribute("href", "tel:01711222333");
  const heroLoaded = await page.locator("section[aria-label='Welcome'] img").evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0);
  expect(heroLoaded).toBe(true);
  await expect(page.getByTestId("section-courses")).toHaveCount(0); // switched off
  // About and Contact live on their own pages (D142).
  await page.goto(url("/about"));
  await expect(page.getByTestId("section-about")).toContainText("Small batches, weekly tests");
  await page.goto(url("/contact"));
  await expect(page.getByTestId("section-contact").locator("iframe")).toHaveAttribute("src", /maps\.google\.com.*Mirpur/);
  await expect(page.getByRole("link", { name: "Open in Maps" })).toBeVisible();
  expect((await page.goto(url("/courses")))?.status()).toBe(404); // switched off, so the page is gone
});

test("W2: the Owner posts a notice, fills the gallery and adds a testimonial (D125, D128, D130)", async ({ page }) => {
  await signInAsOwner(page);
  await page.goto(url("/app/website/notices"));
  await page.getByRole("button", { name: "Add notice" }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("Title").fill("Admission open for HSC 2027");
  await dialog.getByLabel("Text").fill("Forms are available at the office from 10 am to 6 pm.");
  await dialog.getByLabel("Pin to the top of the notices").click();
  await dialog.getByRole("button", { name: "Save notice" }).click();
  await expect(page.getByText("Notice added.")).toBeVisible();
  await expect(page.getByTestId("notice-Admission open for HSC 2027")).toContainText("On the website");

  await page.getByRole("link", { name: "Gallery" }).click();
  await page.getByTestId("gallery-input").setInputFiles([await picture(), { ...(await picture()), name: "prize.jpg" }]);
  await expect(page.getByText("2 photos added.")).toBeVisible();
  await expect(page.getByTestId("gallery-count")).toContainText("2 of 60 photos");
  await page.getByRole("button", { name: "Edit caption of Photo 1" }).click();
  await page.getByRole("dialog").getByLabel("Caption", { exact: true }).fill("Prize-giving 2026");
  await page.getByRole("button", { name: "Save caption" }).click();
  await expect(page.getByText("Caption saved.")).toBeVisible();
  await page.getByRole("button", { name: "Move Prize-giving 2026 later" }).click();
  await expect(page.getByTestId("gallery-photo").last()).toContainText("Prize-giving 2026");

  await page.getByRole("link", { name: "Testimonials" }).click();
  await page.getByRole("button", { name: "Add testimonial" }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("What they said").fill("The weekly tests made all the difference.");
  await dialog.getByLabel("Name", { exact: true }).fill("Nabila Hossain");
  await dialog.getByLabel("Line under the name").fill("SSC 2026, GPA 5");
  await dialog.getByRole("button", { name: "Save testimonial" }).click();
  await expect(page.getByText("Testimonial added.")).toBeVisible();

  await page.goto(url("/"));
  await expect(page.getByTestId("public-testimonial")).toContainText("SSC 2026, GPA 5"); // on Home by default (D143)
  await expect(page.getByRole("navigation", { name: "Pages" }).getByRole("link", { name: "Gallery" })).toBeVisible();
  await page.goto(url("/notices"));
  await expect(page.getByTestId("public-notice")).toContainText("Admission open for HSC 2027");
  await expect(page.getByTestId("public-notice")).toContainText("Pinned");
  await page.goto(url("/gallery"));
  await expect(page.getByTestId("section-gallery").locator("img")).toHaveCount(2);
  await expect(page.getByRole("img", { name: "Prize-giving 2026" })).toBeVisible();
});

test("W3: a visitor sends an enquiry; the Owner calls back and converts it into an admission (D22, D129)", async ({ page }) => {
  await page.goto(url("/"));
  await page.getByRole("link", { name: "Admission", exact: true }).click();
  await expect(page).toHaveURL(url("/admission"));
  await expect(page.getByTestId("page-heading")).toHaveText("Admission");
  const form = page.getByRole("form", { name: "Admission enquiry" });
  await form.getByLabel("Student's name").fill("Tanvir Alam");
  await form.getByLabel("Mobile number").fill("12345");
  await form.getByLabel("Course").selectOption({ label: "SSC Science" });
  await form.getByLabel("Message").fill("Is there an evening batch?");
  await page.waitForTimeout(3_200); // a person takes a few seconds; quicker submissions are dropped as spam
  await form.getByRole("button", { name: "Send enquiry" }).click();
  await expect(form.getByText("Enter a valid Bangladeshi mobile number")).toBeVisible();
  await form.getByLabel("Mobile number").fill("01819-445566");
  await form.getByRole("button", { name: "Send enquiry" }).click();
  await expect(page.getByTestId("enquiry-sent")).toContainText("Thank you");

  await signInAsOwner(page);
  await page.goto(url("/app/website/enquiries"));
  const row = page.getByTestId("enquiry-Tanvir Alam");
  await expect(row).toContainText("01819445566");
  await expect(row).toContainText("Course: SSC Science");
  await row.getByRole("button", { name: "Actions for Tanvir Alam" }).click();
  await page.getByRole("menuitem", { name: "Mark as contacted" }).click();
  await expect(page.getByText("Marked as contacted.")).toBeVisible();
  await page.getByRole("tab", { name: /Contacted/ }).click();
  await page.getByTestId("enquiry-Tanvir Alam").getByRole("link", { name: "Convert" }).click();

  await expect(page.getByTestId("from-enquiry")).toContainText("Tanvir Alam, 01819445566");
  await expect(page.getByLabel("Full name")).toHaveValue("Tanvir Alam");
  await expect(page.getByLabel("Guardian's mobile")).toHaveValue("01819445566");
  await page.getByLabel("Gender", { exact: true }).click();
  await page.getByRole("option", { name: "Male", exact: true }).click();
  await page.getByLabel("Guardian's name").fill("Shahid Alam");
  await page.getByLabel("Relation", { exact: true }).click();
  await page.getByRole("option", { name: "Father", exact: true }).click();
  await page.getByRole("button", { name: "Generate" }).click();
  await page.getByRole("button", { name: "Admit student" }).click();
  const code = (await page.getByTestId("sign-in-id").textContent()) ?? "";
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.getByRole("heading", { name: /Tanvir Alam/, level: 1 })).toBeVisible();

  await page.goto(url("/app/website/enquiries"));
  await page.getByRole("tab", { name: /Converted/ }).click();
  await expect(page.getByTestId("enquiry-Tanvir Alam")).toContainText(`Admitted as ${code}`);
});

test("Website disappears while the module is off and the basic page returns, with the design kept (D5, D21)", async ({ page }) => {
  await setInstituteModules(INSTITUTE.subdomain, { website: false });
  try {
    await page.goto(url("/"));
    await expect(page.getByTestId("website")).toHaveCount(0);
    await expect(page.getByTestId("public-course")).toContainText("SSC Science");
    await signInAsOwner(page);
    await expect(page.getByRole("link", { name: "Website", exact: true })).toHaveCount(0);
    expect((await page.goto(url("/app/website")))?.status()).toBe(404);
  } finally {
    await setInstituteModules(INSTITUTE.subdomain, { website: true });
  }
  await page.goto(url("/"));
  await expect(page.getByTestId("hero-heading")).toHaveText("Your path to GPA 5");
});

test("W6: the Owner sets the layout, writes an announcement, adds Facebook and switches the site to Bangla (D135, D138, D140)", async ({ page }) => {
  await signInAsOwner(page);
  await page.getByRole("link", { name: "Website", exact: true }).click();

  await page.getByRole("tab", { name: "Layout" }).click();
  await page.getByRole("radiogroup", { name: "Header" }).getByRole("radio", { name: /Centred name/ }).click();
  await page.getByRole("radiogroup", { name: "Banner layout" }).getByRole("radio", { name: /Glass panel/ }).click();
  await page.getByRole("radiogroup", { name: "Notices" }).getByRole("radio", { name: /Timeline/ }).click();
  await page.getByRole("radiogroup", { name: "Testimonials" }).getByRole("radio", { name: /Swipe row/ }).click();

  await page.getByRole("tab", { name: "Content" }).click();
  await page.getByRole("radiogroup", { name: "Website language" }).getByRole("radio", { name: /বাংলা/ }).click();
  await page.getByLabel("Announcement", { exact: true }).fill("ভর্তি চলছে: এইচএসসি ২০২৭");
  await page.getByLabel("Link", { exact: true }).fill("#enquiry");
  await page.getByLabel("Link words").fill("যোগাযোগ করুন");
  await page.getByLabel("Facebook").fill("facebook.com/prottasha.coaching");

  await page.getByRole("tab", { name: "Sections" }).click();
  await page.getByRole("button", { name: "Rename Gallery" }).click();
  await page.getByLabel("Heading", { exact: true }).fill("আমাদের মুহূর্তগুলো");

  await page.getByRole("button", { name: "Save website" }).click();
  await expect(page.getByText("Website saved. It's public now.")).toBeVisible();

  await page.goto(url("/"));
  const site = page.getByTestId("website");
  await expect(site).toHaveAttribute("lang", "bn");
  await expect(site).toHaveAttribute("data-site-header", "CENTRED");
  await expect(page.getByTestId("announcement")).toContainText("ভর্তি চলছে: এইচএসসি ২০২৭");
  await expect(page.getByTestId("announcement").getByRole("link", { name: /যোগাযোগ করুন/ })).toHaveAttribute("href", "#enquiry");
  await expect(page.getByRole("link", { name: "Facebook" }).first()).toHaveAttribute("href", "https://facebook.com/prottasha.coaching");
  await expect(page.getByRole("heading", { name: "ভর্তি সংক্রান্ত জিজ্ঞাসা" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Welcome" }).locator(".backdrop-blur-xl")).toHaveCount(1);
  await page.goto(url("/gallery"));
  await expect(page.getByRole("heading", { name: "আমাদের মুহূর্তগুলো" })).toBeVisible();
  // Off Home, the announcement's in-page link points at the enquiry form's page.
  await expect(page.getByTestId("announcement").getByRole("link", { name: /যোগাযোগ করুন/ })).toHaveAttribute("href", "/admission#enquiry");
  await page.goto(url("/notices"));
  await expect(page.getByTestId("section-notices").locator("ol")).toHaveCount(1);
  await page.goto(url("/"));

  // A visitor closes the announcement; it stays closed on the next page view of this visit.
  await page.getByTestId("announcement").getByRole("button", { name: "বন্ধ করুন" }).click();
  await expect(page.getByTestId("announcement")).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId("announcement")).toHaveCount(0);

  // The enquiry form speaks Bangla too.
  const form = page.getByRole("form", { name: "ভর্তি সংক্রান্ত জিজ্ঞাসা" });
  await form.getByRole("button", { name: "পাঠান" }).click();
  await expect(form.getByText("শিক্ষার্থীর নাম লিখুন।")).toBeVisible();
});

test("W7: the Owner adds stats, a reason, a question, a video, an instructor and an achiever (D138, D141)", async ({ page }) => {
  await signInAsOwner(page);
  await page.getByRole("link", { name: "Website", exact: true }).click();

  await page.getByRole("tab", { name: "Content" }).click();
  await page.getByRole("button", { name: "Add a number" }).click();
  await page.getByLabel("Number", { exact: true }).fill("1200");
  await page.getByLabel("What it counts").fill("Students taught");
  await page.getByRole("button", { name: "Add a reason" }).click();
  await page.locator("#feature-0-title").fill("Small batches");
  await page.getByRole("button", { name: "Add a question" }).click();
  await page.getByLabel("Question", { exact: true }).fill("When does admission open?");
  await page.getByLabel("Answer", { exact: true }).fill("In January, for every batch.");
  await page.getByLabel("YouTube address").fill("https://youtu.be/dQw4w9WgXcQ");
  await page.getByRole("button", { name: "Save website" }).click();
  await expect(page.getByText("Website saved. It's public now.")).toBeVisible();

  await page.getByRole("link", { name: "Faculty", exact: true }).click();
  await page.getByRole("button", { name: "Add instructor" }).click();
  const facultyDialog = page.getByRole("dialog");
  await facultyDialog.getByLabel("Instructor").click();
  await page.getByRole("option", { name: "Kamal Uddin" }).click();
  await facultyDialog.getByLabel("Line under the name").fill("Dhaka University, 10 years");
  await facultyDialog.getByRole("button", { name: "Add to website" }).click();
  await expect(page.getByTestId("faculty")).toContainText("Kamal Uddin");

  await page.getByRole("link", { name: "Achievers", exact: true }).click();
  await page.getByRole("button", { name: "Add achiever" }).click();
  const achieverDialog = page.getByRole("dialog");
  await achieverDialog.getByLabel("Student's name").fill("Nabila Hossain");
  await achieverDialog.getByLabel("Result").fill("GPA 5.00");
  await achieverDialog.getByLabel("Exam").fill("SSC 2026");
  await achieverDialog.getByRole("button", { name: "Save achiever" }).click();
  await expect(page.getByTestId("achievers")).toContainText("Nabila Hossain");

  await page.goto(url("/"));
  await expect(page.getByTestId("public-stat")).toContainText("১,২০০"); // the site is in Bangla since W6
  await expect(page.getByTestId("public-feature")).toContainText("Small batches");
  await expect(page.getByTestId("public-achiever")).toContainText("GPA 5.00");
  await page.goto(url("/teachers"));
  await expect(page.getByTestId("public-faculty")).toContainText("Kamal Uddin");
  await expect(page.getByTestId("public-faculty")).toContainText("Dhaka University, 10 years");
  await expect(page.getByTestId("public-faculty")).not.toContainText("kamal@prottasha.test");
  await page.goto(url("/admission"));
  const faq = page.getByTestId("public-faq");
  await faq.getByText("When does admission open?").click();
  await expect(faq.getByText("In January, for every batch.")).toBeVisible();
  // The video is a picture with a play button; the YouTube player loads only after a tap.
  await page.goto(url("/gallery"));
  await expect(page.getByTestId("section-video").locator("iframe")).toHaveCount(0);
  await page.getByTestId("section-video").getByRole("button").click();
  await expect(page.getByTestId("section-video").locator("iframe")).toHaveAttribute("src", /youtube-nocookie\.com\/embed\/dQw4w9WgXcQ/);
});

test("W8: sections rise into view, stats count up and cards tilt; with 'reduce motion' everything shows at once (D137)", async ({ page }) => {
  await page.goto(url("/"));
  const site = page.getByTestId("website");
  await expect(site).toHaveAttribute("data-motion", "on");
  await expect(page.getByTestId("scroll-progress")).toHaveCount(1);
  const stat = page.getByTestId("public-stat");
  await stat.scrollIntoViewIfNeeded();
  await expect(stat).toHaveAttribute("data-shown", "");
  await expect(stat.locator("[data-count-to]")).toHaveText("১,২০০"); // counted up to the full number, in Bangla digits
  const card = page.getByTestId("public-feature");
  await card.hover({ position: { x: 8, y: 8 } });
  await expect.poll(() => card.evaluate((el) => el.style.transform)).toContain("rotateX");
  await expect(site).toHaveAttribute("data-scrolled", "");

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.reload();
  await expect(page.getByTestId("hero-heading")).toBeVisible();
  await expect(site).not.toHaveAttribute("data-motion", "on");
  expect(await page.locator("[data-reveal]").count()).toBe(0);
  await expect(page.getByTestId("public-stat").locator("[data-count-to]")).toHaveText("১,২০০");
});

test("W10: the website has pages; the Owner chooses what is on Home (D142, D143)", async ({ page }) => {
  await page.goto(url("/"));
  const menu = page.getByRole("navigation", { name: "পাতাসমূহ" }); // the site is in Bangla since W6
  await expect(menu.getByRole("link", { name: "হোম" })).toHaveAttribute("aria-current", "page");
  await menu.getByRole("link", { name: "শিক্ষক" }).click();
  await expect(page).toHaveURL(url("/teachers"));
  await expect(page.getByTestId("page-heading")).toHaveText("শিক্ষক");
  await expect(page).toHaveTitle("শিক্ষক · Prottasha Coaching");
  await expect(page.getByTestId("hero-heading")).toHaveCount(0);
  await expect(page.getByTestId("section-faculty")).toBeVisible();
  await page.goto(url("/"));
  await page.getByTestId("see-all-achievers").click();
  await expect(page).toHaveURL(url("/results"));
  await expect(page.getByTestId("section-achievers")).toBeVisible();
  expect((await page.goto(url("/no-such-page")))?.status()).toBe(404);

  // Put the gallery on Home and take testimonials off.
  await signInAsOwner(page);
  await page.goto(url("/app/website"));
  await page.getByRole("tab", { name: "Sections" }).click();
  await page.getByLabel("Show Gallery on Home").click();
  await page.getByLabel("Show Testimonials on Home").click();
  await page.getByRole("button", { name: "Save website" }).click();
  await expect(page.getByText("Website saved. It's public now.")).toBeVisible();
  await page.goto(url("/"));
  await expect(page.getByTestId("section-gallery")).toBeVisible();
  await expect(page.getByTestId("see-all-gallery")).toHaveAttribute("href", "/gallery");
  await expect(page.getByTestId("section-testimonials")).toHaveCount(0);
  await page.goto(url("/results"));
  await expect(page.getByTestId("section-testimonials")).toBeVisible(); // still on its own page
});
