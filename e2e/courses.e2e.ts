import { expect, test, type Page } from "@playwright/test";
import { clearRateLimits, instituteUrl, seedInstitute } from "./helpers";

// One serial story: each test builds on the previous one's data.
test.describe.configure({ mode: "serial" });
test.use({ permissions: ["clipboard-read", "clipboard-write"] });

const INSTITUTE = {
  name: "Sunrise Academic Care",
  subdomain: "sunrise",
  ownerName: "Nusrat Jahan",
  ownerEmail: "owner@sunrise.test",
  password: "TempPass12",
  modules: [],
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

async function pick(page: Page, label: string, option: string) {
  await page.getByLabel(label, { exact: true }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

async function addClassTime(page: Page, subject: string, day: string, starts: string, ends: string) {
  const card = page.getByTestId("batch-subject").filter({ hasText: subject });
  await card.getByLabel("Day").click();
  await page.getByRole("option", { name: day, exact: true }).click();
  await card.getByLabel("Starts").fill(starts);
  await card.getByLabel("Ends").fill(ends);
  await card.getByRole("button", { name: "Add class time" }).click();
}

async function chooseInstructor(page: Page, subject: string, name: string) {
  const card = page.getByTestId("batch-subject").filter({ hasText: subject });
  await card.getByRole("button", { name: `${subject} actions` }).click();
  await page.getByRole("menuitem", { name: "Choose instructors" }).click();
  await page.getByRole("dialog").getByLabel(name).check();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(card.getByText(name)).toBeVisible();
}

test.beforeAll(async () => {
  await seedInstitute(INSTITUTE);
});

test("the Owner sets up a course with subjects", async ({ page }) => {
  await signIn(page, INSTITUTE.password);
  await page.getByLabel("Current (temporary) password").fill(INSTITUTE.password);
  await page.getByLabel("New password", { exact: true }).fill(OWNER_PASSWORD);
  await page.getByLabel("Confirm new password").fill(OWNER_PASSWORD);
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(page).toHaveURL(url("/app"));

  // An instructor to assign later.
  await page.goto(url("/app/instructors"));
  await page.getByRole("button", { name: "New instructor" }).first().click();
  await page.getByLabel("Full name").fill("Mahbub Alam");
  await page.getByLabel("Mobile number").fill("01911223344");
  await page.getByRole("button", { name: "Generate" }).click();
  await page.getByRole("button", { name: "Add instructor" }).click();
  await page.getByRole("button", { name: "Done" }).click();

  await page.getByRole("navigation").first().getByRole("link", { name: "Courses & batches" }).click();
  await expect(page.getByRole("heading", { name: "Courses & batches", level: 1 })).toBeVisible();
  await page.getByRole("button", { name: "New course" }).first().click();
  await page.getByLabel("Course name").fill("HSC 2026 Science");
  await page.getByLabel("Short code").fill("hsc26");
  await pick(page, "Monthly fee due day", "Day 10");
  await page.getByRole("button", { name: "Add course" }).click();

  await expect(page.getByRole("heading", { name: /HSC 2026 Science/, level: 1 })).toBeVisible();
  await expect(page.getByText("HSC26", { exact: true })).toBeVisible();
  await expect(page.getByText("Monthly fee due: Day 10")).toBeVisible();
  for (const subject of ["Physics", "Chemistry"]) {
    await page.getByRole("button", { name: "Add subject" }).click();
    await page.getByLabel("Subject name").fill(subject);
    await page.getByRole("dialog").getByRole("button", { name: "Add subject" }).click();
    await expect(page.getByRole("listitem").filter({ has: page.getByText(subject, { exact: true }) })).toBeVisible();
  }
});

test("the Owner builds a batch with subjects, an instructor and a weekly schedule", async ({ page }) => {
  await signIn(page, OWNER_PASSWORD);
  await expect(page).toHaveURL(url("/app"));
  await page.goto(url("/app/courses"));
  await page.getByRole("row", { name: /HSC 2026 Science/ }).click();

  await page.getByRole("button", { name: "New batch" }).click();
  await page.getByLabel("Batch name").fill("Morning");
  await page.getByRole("button", { name: "Add batch" }).click();
  await expect(page.getByRole("heading", { name: /Morning/, level: 1 })).toBeVisible();

  await pick(page, "Subject to add", "Physics");
  await page.getByRole("button", { name: "Add subject" }).click();
  await expect(page.getByTestId("batch-subject").filter({ hasText: "Physics" })).toBeVisible();
  await chooseInstructor(page, "Physics", "Mahbub Alam");
  await addClassTime(page, "Physics", "Saturday", "16:00", "17:30");
  await expect(page.getByTestId("batch-subject").filter({ hasText: "Physics" })).toContainText("16:00–17:30");
});

test("a second batch can't put the instructor in two classes at once", async ({ page }) => {
  await signIn(page, OWNER_PASSWORD);
  await expect(page).toHaveURL(url("/app"));
  await page.goto(url("/app/courses"));
  await page.getByRole("row", { name: /HSC 2026 Science/ }).click();
  await page.getByRole("button", { name: "New batch" }).click();
  await page.getByLabel("Batch name").fill("Evening");
  await page.getByRole("button", { name: "Add batch" }).click();
  await expect(page.getByRole("heading", { name: /Evening/, level: 1 })).toBeVisible();

  await pick(page, "Subject to add", "Chemistry");
  await page.getByRole("button", { name: "Add subject" }).click();
  await chooseInstructor(page, "Chemistry", "Mahbub Alam");
  await addClassTime(page, "Chemistry", "Saturday", "17:00", "18:00");
  await expect(page.getByText("Mahbub Alam already teaches Physics (Morning) on Saturday, 16:00–17:30.")).toBeVisible();
  const chemistry = page.getByTestId("batch-subject").filter({ hasText: "Chemistry" });
  await expect(chemistry).toContainText("No class times yet.");
  await chemistry.getByLabel("Starts").fill("17:30");
  await chemistry.getByLabel("Ends").fill("18:30");
  await chemistry.getByRole("button", { name: "Add class time" }).click();
  await expect(chemistry).toContainText("17:30–18:30");
});

test("a course in use can't be deleted; the Owner archives it instead", async ({ page }) => {
  await signIn(page, OWNER_PASSWORD);
  await expect(page).toHaveURL(url("/app"));
  await page.goto(url("/app/courses"));
  await page.getByRole("row", { name: /HSC 2026 Science/ }).click();
  await page.getByRole("button", { name: "Actions", exact: true }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByText("Can't delete HSC 2026 Science")).toBeVisible();
  await expect(page.getByText(/2 subjects · 2 batches/)).toBeVisible();
  await page.getByRole("button", { name: "Archive instead" }).click();
  await expect(page.getByRole("heading", { name: /HSC 2026 Science/, level: 1 })).toContainText("Archived");
  await expect(page.getByText("This course is archived.")).toBeVisible();
  await expect(page.getByRole("button", { name: "New batch" })).toHaveCount(0);

  await page.goto(url("/app/courses"));
  await expect(page.getByText("No courses yet")).toBeVisible();
});
