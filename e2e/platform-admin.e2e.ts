import { expect, test, type Page } from "@playwright/test";
import { E2E_ADMIN } from "./global-setup";
import { clearRateLimits, instituteUrl, platformUrl } from "./helpers";

// One serial story: each test builds on the previous one's data.
test.describe.configure({ mode: "serial" });
test.use({ permissions: ["clipboard-read", "clipboard-write"] });

const INSTITUTE = { name: "Udayan Coaching Centre", subdomain: "udayan-coaching-centre", owner: "Rahim Uddin", email: "owner@udayan.test" };

async function signInAsPlatformAdmin(page: Page) {
  await clearRateLimits();
  await page.goto(platformUrl("/login"));
  await page.getByLabel("Email").fill(E2E_ADMIN.email);
  await page.getByLabel("Password", { exact: true }).fill(E2E_ADMIN.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(platformUrl("/institutes"));
}

test("an unauthenticated visitor lands on sign-in; a wrong password gets the generic message", async ({ page }) => {
  await clearRateLimits();
  await page.goto(platformUrl("/"));
  await expect(page).toHaveURL(platformUrl("/login"));
  await page.getByLabel("Email").fill(E2E_ADMIN.email);
  await page.getByLabel("Password", { exact: true }).fill("not-the-password-1");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Invalid email or password.")).toBeVisible();
});

test("create an institute through the New institute wizard, with paid modules chosen", async ({ page }) => {
  await signInAsPlatformAdmin(page);
  await expect(page.getByRole("heading", { name: "Institutes", level: 1 })).toBeVisible();

  await page.getByRole("button", { name: "New institute" }).first().click();
  await page.getByLabel("Institute name").fill(INSTITUTE.name);
  await expect(page.getByLabel("Subdomain")).toHaveValue(INSTITUTE.subdomain); // suggested from the name
  await expect(page.getByText("Available")).toBeVisible();
  await page.getByRole("button", { name: "Next", exact: true }).click();

  // Core is always included; paid modules are independent of each other.
  await expect(page.getByLabel("Core")).toBeDisabled();
  await page.getByLabel("Fees & Payments").check();
  await page.getByLabel("Exams & Results").check();
  await expect(page.getByLabel("Attendance & Leave")).toBeEnabled();
  await page.getByRole("button", { name: "Next", exact: true }).click();

  await page.getByLabel("Owner name").fill(INSTITUTE.owner);
  await page.getByLabel("Owner email").fill(INSTITUTE.email);
  await page.getByRole("button", { name: "Generate" }).click();
  await page.getByRole("button", { name: "Next", exact: true }).click();

  await page.getByRole("button", { name: "Create institute" }).click();
  await expect(page.getByText(`${INSTITUTE.name} is ready`)).toBeVisible();
  expect(await page.getByTestId("one-time-password").textContent()).toMatch(/^(?=.*[A-Za-z])(?=.*\d).{12}$/);
  // The dialog won't close until the one-time password is copied.
  await page.getByRole("button", { name: "Copy" }).click();
  await page.getByRole("button", { name: "Done" }).click();

  const row = page.getByRole("row", { name: new RegExp(INSTITUTE.name) });
  await expect(row).toContainText("Active");
  await expect(row).toContainText("3"); // Core + Fees + Exams
});

test("the new institute's public page is live at its own address", async ({ page }) => {
  await page.goto(instituteUrl(INSTITUTE.subdomain));
  await expect(page.getByRole("heading", { level: 1, name: INSTITUTE.name })).toBeVisible();
});

test("switch a module on and off, set the paid-until date, suspend and reactivate", async ({ page }) => {
  await signInAsPlatformAdmin(page);
  await page.getByRole("row", { name: new RegExp(INSTITUTE.name) }).click();
  await expect(page.getByRole("heading", { name: new RegExp(INSTITUTE.name) })).toBeVisible();

  await page.getByRole("tab", { name: "Modules" }).click();
  await expect(page.getByRole("switch", { name: "Disable Core" })).toBeDisabled();
  await page.getByRole("switch", { name: "Enable Attendance & Leave" }).click();
  await page.getByRole("button", { name: "Enable", exact: true }).click();
  await expect(page.getByRole("switch", { name: "Disable Attendance & Leave" })).toBeChecked();

  await page.getByRole("switch", { name: "Disable Fees & Payments" }).click();
  await expect(page.getByText(/Its data is kept/)).toBeVisible();
  await page.getByRole("button", { name: "Disable", exact: true }).click();
  await expect(page.getByRole("switch", { name: "Enable Fees & Payments" })).not.toBeChecked();

  await page.getByRole("button", { name: "Actions" }).click();
  await page.getByRole("menuitem", { name: "Set paid-until date" }).click();
  await page.getByLabel("Paid until").fill("2027-06-30");
  await page.getByRole("button", { name: "Save" }).click();
  await page.getByRole("tab", { name: "Profile" }).click();
  await expect(page.getByText("Paid until")).toBeVisible();
  await expect(page.getByRole("definition").filter({ hasText: "2027" })).toBeVisible();

  await page.getByRole("button", { name: "Actions" }).click();
  await page.getByRole("menuitem", { name: "Suspend" }).click();
  await expect(page.getByRole("button", { name: "Suspend", exact: true })).toBeDisabled(); // reason required
  await page.getByLabel("Reason").fill("Invoice overdue");
  await page.getByRole("button", { name: "Suspend", exact: true }).click();
  await expect(page.getByRole("heading", { name: new RegExp(INSTITUTE.name) })).toContainText("Suspended");

  await page.getByRole("button", { name: "Actions" }).click();
  await page.getByRole("menuitem", { name: "Reactivate" }).click();
  await page.getByRole("button", { name: "Reactivate", exact: true }).click();
  await expect(page.getByRole("heading", { name: new RegExp(INSTITUTE.name) })).toContainText("Active");
});

test("every change above is in the platform audit log", async ({ page }) => {
  await signInAsPlatformAdmin(page);
  await page.getByRole("link", { name: "Audit log" }).click();
  for (const action of ["Institute created", "Module entitlement changed", "Institute paid until changed", "Institute suspended", "Institute reactivated"]) {
    await expect(page.getByText(action).first(), action).toBeVisible();
  }
});
