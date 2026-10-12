import { expect, test, type Page } from "@playwright/test";
import { clearRateLimits, instituteUrl, seedInstitute } from "./helpers";

// One serial story: each test builds on the previous one's data.
test.describe.configure({ mode: "serial" });
test.use({ permissions: ["clipboard-read", "clipboard-write"] });

const INSTITUTE = {
  name: "Bright Minds Coaching",
  subdomain: "brightminds",
  ownerName: "Farhana Akter",
  ownerEmail: "owner@brightminds.test",
  password: "TempPass12",
  modules: [],
};
const OWNER_PASSWORD = "OwnerChosen123";
const INSTRUCTOR = { name: "Mahbub Alam", phone: "01911223344" };
const url = (path: string) => instituteUrl(INSTITUTE.subdomain, path);
let instructorPassword = "";

async function signIn(page: Page, identifier: string, password: string) {
  await clearRateLimits();
  await page.goto(url("/login"));
  await page.getByLabel("Email, mobile number or student ID").fill(identifier);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

async function changePassword(page: Page, current: string, next: string) {
  await page.getByLabel("Current (temporary) password").fill(current);
  await page.getByLabel("New password", { exact: true }).fill(next);
  await page.getByLabel("Confirm new password").fill(next);
  await page.getByRole("button", { name: "Change password" }).click();
}

async function signInAsOwner(page: Page) {
  await signIn(page, INSTITUTE.ownerEmail, OWNER_PASSWORD);
  await expect(page).toHaveURL(url("/app"));
}

test.beforeAll(async () => {
  await seedInstitute(INSTITUTE);
});

test("the Owner adds an instructor from the Instructors page", async ({ page }) => {
  await signIn(page, INSTITUTE.ownerEmail, INSTITUTE.password);
  await changePassword(page, INSTITUTE.password, OWNER_PASSWORD);
  await expect(page).toHaveURL(url("/app"));

  await page.getByRole("navigation").first().getByRole("link", { name: "Instructors" }).click();
  await expect(page.getByRole("heading", { name: "Instructors", level: 1 })).toBeVisible();
  await page.getByRole("button", { name: "New instructor" }).first().click();
  await page.getByLabel("Full name").fill(INSTRUCTOR.name);
  await page.getByLabel("Mobile number").fill("+880 1911-223344");
  await page.getByRole("button", { name: "Generate" }).click();
  await page.getByRole("button", { name: "Add instructor" }).click();
  instructorPassword = (await page.getByTestId("one-time-password").textContent()) ?? "";
  expect(instructorPassword.length).toBeGreaterThanOrEqual(8);
  await page.getByRole("button", { name: "Done" }).click();

  const row = page.getByRole("row", { name: new RegExp(INSTRUCTOR.name) });
  await expect(row).toContainText(INSTRUCTOR.phone); // stored in the normalised 01XXXXXXXXX form
  await expect(row).toContainText("Active");
});

test("the instructor signs in by mobile number and lands in the instructor portal (D17, D24)", async ({ page }) => {
  await signIn(page, INSTRUCTOR.phone, instructorPassword);
  await expect(page).toHaveURL(url("/change-password"));
  await changePassword(page, instructorPassword, "Teach12345");
  instructorPassword = "Teach12345";
  await expect(page).toHaveURL(url("/app/instructor"));
  await expect(page.getByText("Instructor portal", { exact: true })).toBeVisible();

  // Admin pages send an instructor back to their own portal.
  await page.goto(url("/app/instructors"));
  await expect(page).toHaveURL(url("/app/instructor"));
  await page.goto(url("/app/settings"));
  await expect(page).toHaveURL(url("/app/instructor"));
});

test("the Owner finds, edits and deactivates the instructor; deactivation blocks sign-in", async ({ page, browser }) => {
  await signInAsOwner(page);
  await page.goto(url("/app/instructors"));
  await page.getByLabel("Search instructors").fill("1911");
  await page.getByRole("row", { name: new RegExp(INSTRUCTOR.name) }).click();
  await expect(page.getByRole("heading", { name: new RegExp(INSTRUCTOR.name) })).toBeVisible();

  await page.getByRole("button", { name: "Actions" }).click();
  await page.getByRole("menuitem", { name: "Edit details" }).click();
  await page.getByLabel("Email").fill("mahbub@brightminds.test");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("mahbub@brightminds.test")).toBeVisible();

  await page.getByRole("button", { name: "Actions" }).click();
  await page.getByRole("menuitem", { name: "Deactivate" }).click();
  await page.getByRole("button", { name: "Deactivate", exact: true }).click();
  await expect(page.getByRole("heading", { name: new RegExp(INSTRUCTOR.name) })).toContainText("Inactive");

  const context = await browser.newContext();
  const instructor = await context.newPage();
  await signIn(instructor, INSTRUCTOR.phone, instructorPassword);
  await expect(instructor.getByText("Invalid sign-in details or password.")).toBeVisible();
  await context.close();

  await page.getByRole("button", { name: "Actions" }).click();
  await page.getByRole("menuitem", { name: "Reactivate" }).click();
  await page.getByRole("button", { name: "Reactivate", exact: true }).click();
  await expect(page.getByRole("heading", { name: new RegExp(INSTRUCTOR.name) })).toContainText("Active");
});
