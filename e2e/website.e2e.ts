import { expect, test, type Page } from "@playwright/test";
import sharp from "sharp";
import { clearRateLimits, instituteUrl, seedInstitute, seedTeaching, setInstituteModules, setInstituteProfile } from "./helpers";

// One serial story for the Website module; each milestone (W1–W3) adds its steps.
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

test("W1: the Owner designs the website and it is public at once (D124, D126, D131, D133)", async ({ page }) => {
  await signInAsOwner(page);
  await page.getByRole("link", { name: "Website", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Website" })).toBeVisible();

  await page.getByRole("radio", { name: /Bold/ }).click();
  await page.getByLabel("Heading font").click();
  await page.getByRole("option", { name: /Poppins/ }).click();
  await page.getByLabel("Heading", { exact: true }).first().fill("Your path to GPA 5");
  await page.getByLabel("Line under the heading").fill("SSC and HSC coaching in Mirpur since 2010");
  await page.locator("#hero_image").setInputFiles(await picture());
  await expect(page.getByRole("img", { name: "Welcome banner picture" })).toBeVisible();
  await page.getByLabel("Button", { exact: true }).click();
  await page.getByRole("option", { name: /^Call/ }).click();
  await page.getByLabel("Text", { exact: true }).fill("Small batches, weekly tests and caring teachers.");
  await page.getByLabel("Show Courses & batches").click();
  await page.getByRole("button", { name: "Move Contact & map up" }).click();
  await page.getByRole("button", { name: "Save website" }).click();
  await expect(page.getByText("Website saved. It's public now.")).toBeVisible();

  await page.goto(url("/"));
  const site = page.getByTestId("website");
  await expect(site).toHaveAttribute("data-site-theme", "bold");
  await expect(page.getByTestId("hero-heading")).toHaveText("Your path to GPA 5");
  await expect(page.getByRole("link", { name: "Call 01711-222333" })).toHaveAttribute("href", "tel:01711222333");
  const heroLoaded = await page.locator("section[aria-label='Welcome'] img").evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0);
  expect(heroLoaded).toBe(true);
  await expect(page.getByTestId("section-about")).toContainText("Small batches, weekly tests");
  await expect(page.getByTestId("section-courses")).toHaveCount(0); // switched off
  await expect(page.getByTestId("section-contact").locator("iframe")).toHaveAttribute("src", /maps\.google\.com.*Mirpur/);
  await expect(page.getByRole("link", { name: "Open in Maps" })).toBeVisible();
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
