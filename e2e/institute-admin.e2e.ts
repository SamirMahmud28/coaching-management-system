import { expect, test, type Page } from "@playwright/test";
import { clearRateLimits, instituteUrl, seedInstitute } from "./helpers";

// One serial story: each test builds on the previous one's data.
test.describe.configure({ mode: "serial" });
test.use({ permissions: ["clipboard-read", "clipboard-write"] });

const INSTITUTE = {
  name: "Rainbow Coaching",
  subdomain: "rainbow",
  ownerName: "Nusrat Jahan",
  ownerEmail: "owner@rainbow.test",
  password: "TempPass12",
  modules: ["fees"],
};
const url = (path: string) => instituteUrl(INSTITUTE.subdomain, path);
let ownerPassword = INSTITUTE.password;

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

test.beforeAll(async () => {
  await seedInstitute(INSTITUTE);
});

test("the Owner signs in at the institute's address, must change the password, then reaches the dashboard", async ({ page }) => {
  await page.goto(url("/"));
  await page.getByRole("link", { name: "Sign in" }).click();
  await expect(page).toHaveURL(url("/login"));

  await signIn(page, INSTITUTE.ownerEmail, "wrong-password-1");
  await expect(page.getByText("Invalid sign-in details or password.")).toBeVisible();

  await signIn(page, INSTITUTE.ownerEmail, ownerPassword);
  await expect(page).toHaveURL(url("/change-password"));
  // Nothing else is reachable until the password is changed.
  await page.goto(url("/app"));
  await expect(page).toHaveURL(url("/change-password"));

  await changePassword(page, ownerPassword, "OwnerChosen123");
  ownerPassword = "OwnerChosen123";
  await expect(page).toHaveURL(url("/app"));
  await expect(page.getByRole("heading", { name: `Welcome, ${INSTITUTE.ownerName}` })).toBeVisible();
});

test("navigation and direct URLs follow the institute's modules (D5, investigation F3)", async ({ page }) => {
  await signIn(page, INSTITUTE.ownerEmail, ownerPassword);
  await expect(page).toHaveURL(url("/app"));
  const nav = page.getByRole("navigation").first();
  for (const label of ["Dashboard", "Fees", "Users", "Modules", "Audit log", "Settings"]) {
    await expect(nav.getByRole("link", { name: label })).toBeVisible();
  }
  await expect(nav.getByRole("link", { name: "Exams" })).toHaveCount(0);

  // An enabled module's own page opens (Fees has its screens since F2; other modules still show a placeholder).
  await page.goto(url("/app/fees"));
  await expect(page.getByRole("heading", { name: "Fees", level: 1 })).toBeVisible();
  // A switched-off module's page doesn't exist for this institute.
  const res = await page.goto(url("/app/exams"));
  expect(res?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
});

test("settings: the student ID pattern previews the next ID and saves (D15, D16)", async ({ page }) => {
  await signIn(page, INSTITUTE.ownerEmail, ownerPassword);
  await expect(page).toHaveURL(url("/app"));
  await page.goto(url("/app/settings"));
  await page.getByLabel("Prefix").fill("RB");
  await expect(page.getByTestId("student-id-example")).toHaveText(`RB-${new Date().getFullYear()}-0001`);
  await page.getByRole("button", { name: "Save pattern" }).click();
  await expect(page.getByText("Student ID pattern saved.")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Prefix")).toHaveValue("RB");
});

test("users: the Owner adds an Accountant who signs in by mobile number with limited access", async ({ page, browser }) => {
  await signIn(page, INSTITUTE.ownerEmail, ownerPassword);
  await expect(page).toHaveURL(url("/app"));
  await page.goto(url("/app/users"));
  await page.getByRole("button", { name: "New user" }).click();
  await page.getByLabel("Name").fill("Karim Accounts");
  await page.getByLabel("Mobile number").fill("01712345678");
  await page.getByRole("checkbox", { name: "Accountant" }).check();
  await page.getByRole("button", { name: "Generate" }).click();
  await page.getByRole("button", { name: "Create user" }).click();
  const accountantPassword = (await page.getByTestId("one-time-password").textContent()) ?? "";
  expect(accountantPassword.length).toBeGreaterThanOrEqual(8);
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.getByRole("row", { name: /Karim Accounts/ })).toContainText("Accountant");

  const context = await browser.newContext();
  const accountant = await context.newPage();
  await signIn(accountant, "+880 1712-345678", accountantPassword);
  await expect(accountant).toHaveURL(url("/change-password"));
  await changePassword(accountant, accountantPassword, "Accounts123");
  await expect(accountant).toHaveURL(url("/app"));
  const nav = accountant.getByRole("navigation").first();
  await expect(nav.getByRole("link", { name: "Dashboard" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Users" })).toHaveCount(0);
  await expect(nav.getByRole("link", { name: "Settings" })).toHaveCount(0);
  expect((await accountant.goto(url("/app/settings")))?.status()).toBe(404);
  await context.close();
});

test("modules: the institute requests a module; only a Super Admin can switch it on", async ({ page }) => {
  await signIn(page, INSTITUTE.ownerEmail, ownerPassword);
  await expect(page).toHaveURL(url("/app"));
  await page.goto(url("/app/modules"));
  const row = page.getByRole("row", { name: /Exams & Results/ });
  await row.getByRole("button", { name: "Request module" }).click();
  await page.getByRole("button", { name: "Send request" }).click();
  await expect(row.getByRole("button", { name: "Requested" })).toBeDisabled();
});

test("help: every page explains itself on request, and the Help centre has the guides for what this user can use (D96, D98)", async ({ page }) => {
  await signIn(page, INSTITUTE.ownerEmail, ownerPassword);
  await expect(page).toHaveURL(url("/app"));
  const panel = page.getByTestId("how-this-works");
  await expect(panel).not.toContainText("Set your institute up in this order"); // collapsed until clicked
  await panel.getByRole("button", { name: /How this works/ }).click();
  await expect(panel).toContainText("Set your institute up in this order");

  await page.getByRole("navigation").first().getByRole("link", { name: "Help" }).click();
  await expect(page.getByRole("heading", { name: "Help", level: 1 })).toBeVisible();
  const guide = page.getByTestId("guide-fees-student"); // Fees is on here
  await expect(guide).toContainText("A student's fees page shows");
  await expect(guide).not.toContainText("Each charge is paid in full");
  await guide.getByRole("button", { name: /Collecting payments and receipts/ }).click();
  await expect(guide).toContainText("Each charge is paid in full");
  await guide.getByText("The parent paid part of the month.").click();
  await expect(page.getByText(/waive the agreed part first/)).toBeVisible();

  // A page panel's link opens that guide in the Help centre.
  await page.goto(url("/app/courses"));
  await page.getByTestId("how-this-works").getByRole("button", { name: /How this works/ }).click();
  await page.getByRole("link", { name: /Read the full guide/ }).click();
  await expect(page).toHaveURL(url("/app/help#courses"));
  await expect(page.getByTestId("guide-courses")).toContainText("Why can't I delete a course?");
});
