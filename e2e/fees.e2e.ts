import { expect, test, type Page } from "@playwright/test";
import { clearRateLimits, instituteUrl, seedInstitute, setInstituteModules } from "./helpers";

// One serial story for the Fees module; each milestone (F2–F6) adds its steps.
test.describe.configure({ mode: "serial" });
test.use({ permissions: ["clipboard-read", "clipboard-write"] });

const INSTITUTE = {
  name: "Shikkha Coaching Home",
  subdomain: "shikkha",
  ownerName: "Rafiq Islam",
  ownerEmail: "owner@shikkha.test",
  password: "TempPass12",
  modules: ["fees"],
};
const OWNER_PASSWORD = "OwnerChosen123";
const url = (path: string) => instituteUrl(INSTITUTE.subdomain, path);

async function signIn(page: Page, password: string) {
  await clearRateLimits();
  await page.goto(url("/login"));
  await page.getByLabel("Email, mobile number or student ID").fill(INSTITUTE.ownerEmail);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

async function signInAsOwner(page: Page) {
  await signIn(page, OWNER_PASSWORD);
  await expect(page).toHaveURL(url("/app"));
}

async function pick(page: Page, label: string, option: string) {
  await page.getByLabel(label, { exact: true }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

test.beforeAll(async () => {
  await seedInstitute(INSTITUTE);
});

test("the Owner sets up a course with a batch and a student", async ({ page }) => {
  await signIn(page, INSTITUTE.password);
  await page.getByLabel("Current (temporary) password").fill(INSTITUTE.password);
  await page.getByLabel("New password", { exact: true }).fill(OWNER_PASSWORD);
  await page.getByLabel("Confirm new password").fill(OWNER_PASSWORD);
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(page).toHaveURL(url("/app"));

  await page.goto(url("/app/courses"));
  await page.getByRole("button", { name: "New course" }).first().click();
  await page.getByLabel("Course name").fill("HSC 2026 Science");
  await page.getByLabel("Short code").fill("HSC26");
  await pick(page, "Monthly fee due day", "Day 10");
  await page.getByRole("button", { name: "Add course" }).click();
  await page.getByRole("button", { name: "Add subject" }).click();
  await page.getByLabel("Subject name").fill("Physics");
  await page.getByRole("dialog").getByRole("button", { name: "Add subject" }).click();
  await page.getByRole("button", { name: "New batch" }).click();
  await page.getByLabel("Batch name").fill("Morning");
  await page.getByRole("button", { name: "Add batch" }).click();
  await expect(page.getByRole("heading", { name: /Morning/, level: 1 })).toBeVisible();

  await page.goto(url("/app/students/new"));
  await page.getByLabel("Full name").fill("Tania Akter");
  await pick(page, "Gender", "Female");
  await page.getByLabel("Guardian's name").fill("Abdul Karim");
  await pick(page, "Relation", "Father");
  await page.getByLabel("Guardian's mobile").fill("01711223344");
  await page.getByLabel(/Morning/).check();
  await page.getByRole("button", { name: "Generate" }).click();
  await page.getByRole("button", { name: "Admit student" }).click();
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.getByRole("heading", { name: /Tania Akter/, level: 1 })).toBeVisible();
});

test("F2: the Owner adds the course's fees and sets the receipt prefix (D28, D38)", async ({ page }) => {
  await signInAsOwner(page);
  await page.getByRole("navigation").first().getByRole("link", { name: "Fees" }).click();
  await expect(page.getByRole("heading", { name: "Fees", level: 1 })).toBeVisible();
  const course = page.getByTestId("course-fees").filter({ hasText: "HSC 2026 Science" });
  await expect(course).toContainText("due on day 10");

  await course.getByRole("button", { name: "Add fee" }).click();
  await page.getByLabel("Name").fill("Tuition");
  await page.getByLabel("Amount (৳)").fill("2000");
  await page.getByRole("dialog").getByRole("button", { name: "Add fee" }).click();
  await expect(course).toContainText("৳2,000.00");

  await course.getByRole("button", { name: "Add fee" }).click();
  await pick(page, "Kind", "Admission (one-time)");
  await page.getByLabel("Name").fill("Admission");
  await page.getByLabel("Amount (৳)").fill("1500");
  await page.getByRole("dialog").getByRole("button", { name: "Add fee" }).click();
  await expect(course).toContainText("Admission (one-time)");

  await course.getByRole("button", { name: "Tuition actions" }).click();
  await page.getByRole("menuitem", { name: "Edit" }).click();
  await page.getByLabel("Amount (৳)").fill("2200");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(course).toContainText("৳2,200.00");

  await page.getByLabel("Receipt prefix").fill("shk");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("SHK-000123")).toBeVisible();
});

test("F2: a student's own amount, with a reason (D29)", async ({ page }) => {
  await signInAsOwner(page);
  await page.goto(url("/app/students"));
  await page.getByRole("row", { name: /Tania Akter/ }).click();
  const amounts = page.getByTestId("fee-amounts");
  await expect(amounts).toContainText("Tuition");
  await amounts.getByRole("listitem").filter({ hasText: "Tuition" }).getByRole("button", { name: "Set own amount" }).click();
  await page.getByLabel("Amount (৳)").fill("1800");
  await page.getByLabel("Reason").fill("Sibling rate");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(amounts).toContainText("৳1,800.00");
  await expect(amounts).toContainText("Own amount: Sibling rate");
});

test("F2: with Fees switched off, its page and the student's fee card disappear (D5)", async ({ page }) => {
  await setInstituteModules(INSTITUTE.subdomain, { fees: false });
  try {
    await signInAsOwner(page);
    await expect(page.getByRole("navigation").first().getByRole("link", { name: "Fees" })).toHaveCount(0);
    await page.goto(url("/app/fees"));
    await expect(page.getByText("Page not found")).toBeVisible();
    await page.goto(url("/app/students"));
    await page.getByRole("row", { name: /Tania Akter/ }).click();
    await expect(page.getByRole("heading", { name: /Tania Akter/, level: 1 })).toBeVisible();
    await expect(page.getByTestId("fee-amounts")).toHaveCount(0);
  } finally {
    await setInstituteModules(INSTITUTE.subdomain, { fees: true });
  }
});
