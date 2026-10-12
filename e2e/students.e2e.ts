import { expect, test, type Page } from "@playwright/test";
import { clearRateLimits, instituteUrl, seedInstitute } from "./helpers";

// One serial story: each test builds on the previous one's data.
test.describe.configure({ mode: "serial" });
test.use({ permissions: ["clipboard-read", "clipboard-write"] });

const INSTITUTE = {
  name: "Udoy Coaching Centre",
  subdomain: "udoy",
  ownerName: "Tahmina Rahman",
  ownerEmail: "owner@udoy.test",
  password: "TempPass12",
  modules: [],
};
const OWNER_PASSWORD = "OwnerChosen123";
const url = (path: string) => instituteUrl(INSTITUTE.subdomain, path);
const student = { id: "", password: "" };

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

async function pick(page: Page, label: string, option: string) {
  await page.getByLabel(label, { exact: true }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

async function changeStatus(page: Page, to: string, reason?: string) {
  await page.getByRole("button", { name: "Actions", exact: true }).click();
  await page.getByRole("menuitem", { name: "Change status" }).click();
  await pick(page, "New status", to);
  if (reason) await page.getByLabel("Reason").fill(reason);
  await page.getByRole("button", { name: "Change status", exact: true }).click();
}

test.beforeAll(async () => {
  await seedInstitute(INSTITUTE);
});

test("the Owner sets up a course with a batch", async ({ page }) => {
  await signIn(page, INSTITUTE.ownerEmail, INSTITUTE.password);
  await changePassword(page, INSTITUTE.password, OWNER_PASSWORD);
  await expect(page).toHaveURL(url("/app"));

  await page.goto(url("/app/courses"));
  await page.getByRole("button", { name: "New course" }).first().click();
  await page.getByLabel("Course name").fill("HSC 2026 Science");
  await page.getByLabel("Short code").fill("HSC26");
  await page.getByRole("button", { name: "Add course" }).click();
  await page.getByRole("button", { name: "Add subject" }).click();
  await page.getByLabel("Subject name").fill("Physics");
  await page.getByRole("dialog").getByRole("button", { name: "Add subject" }).click();
  await page.getByRole("button", { name: "New batch" }).click();
  await page.getByLabel("Batch name").fill("Morning");
  await page.getByRole("button", { name: "Add batch" }).click();
  await expect(page.getByRole("heading", { name: /Morning/, level: 1 })).toBeVisible();
});

test("the Owner admits a student into the batch; the ID comes from the pattern", async ({ page }) => {
  await signInAsOwner(page);
  await page.getByRole("navigation").first().getByRole("link", { name: "Students" }).click();
  await expect(page.getByRole("heading", { name: "Students", level: 1 })).toBeVisible();
  await page.getByRole("link", { name: "Admit student" }).first().click();

  await page.getByLabel("Full name").fill("Nusrat Jahan");
  await pick(page, "Gender", "Female");
  await page.getByLabel("School or college").fill("Viqarunnisa Noon College");
  await page.getByLabel("Guardian's name").fill("Abdul Karim");
  await pick(page, "Relation", "Father");
  await page.getByLabel("Guardian's mobile").fill("01711-223344");
  await pick(page, "Course", "HSC 2026 Science (HSC26)");
  await page.getByLabel(/Morning/).check();
  await page.getByRole("button", { name: "Generate" }).click();
  await page.getByRole("button", { name: "Admit student" }).click();

  student.id = (await page.getByTestId("sign-in-id").textContent()) ?? "";
  student.password = (await page.getByTestId("one-time-password").textContent()) ?? "";
  expect(student.id).toMatch(/^\d{4}-0001$/); // the default pattern: admission year and a number
  await page.getByRole("button", { name: "Done" }).click();

  await expect(page.getByRole("heading", { name: /Nusrat Jahan/, level: 1 })).toContainText("Active");
  await expect(page.getByTestId("student-code")).toHaveText(student.id);
  await expect(page.getByTestId("membership")).toContainText("Morning");
  await expect(page.getByText("01711223344")).toBeVisible(); // stored normalised

  await page.getByRole("link", { name: "Morning" }).click();
  await expect(page.getByText("Students (1)")).toBeVisible();
  await expect(page.getByRole("link", { name: /Nusrat Jahan/ })).toBeVisible();
});

test("the student signs in with the student ID and lands in the student portal (D17)", async ({ page }) => {
  await signIn(page, student.id, student.password);
  await expect(page).toHaveURL(url("/change-password"));
  await changePassword(page, student.password, "Student12345");
  student.password = "Student12345";
  await expect(page).toHaveURL(url("/app/student"));
  await expect(page.getByText("Student portal", { exact: true })).toBeVisible();
  await page.goto(url("/app/students"));
  await expect(page).toHaveURL(url("/app/student"));
});

test("On Hold stops the student signing in; Active lets them back (D26)", async ({ page, browser }) => {
  await signInAsOwner(page);
  await page.goto(url("/app/students"));
  await page.getByLabel("Search students").fill(student.id);
  await page.getByRole("row", { name: /Nusrat Jahan/ }).click();
  await changeStatus(page, "On hold");
  await expect(page.getByRole("heading", { name: /Nusrat Jahan/, level: 1 })).toContainText("On hold");

  const context = await browser.newContext();
  const studentPage = await context.newPage();
  await signIn(studentPage, student.id, student.password);
  await expect(studentPage.getByText("Invalid sign-in details or password.")).toBeVisible();

  await changeStatus(page, "Active");
  await expect(page.getByRole("heading", { name: /Nusrat Jahan/, level: 1 })).toContainText("Active");
  await signIn(studentPage, student.id, student.password);
  await expect(studentPage).toHaveURL(url("/app/student"));
  await context.close();
});

test("leaving needs a reason and closes the student's batches (D9, D14)", async ({ page }) => {
  await signInAsOwner(page);
  await page.goto(url("/app/students"));
  await page.getByRole("row", { name: /Nusrat Jahan/ }).click();
  await page.getByRole("button", { name: "Actions", exact: true }).click();
  await page.getByRole("menuitem", { name: "Change status" }).click();
  await pick(page, "New status", "Left");
  await expect(page.getByRole("button", { name: "Change status", exact: true })).toBeDisabled();
  await page.getByLabel("Reason").fill("Moved to Chattogram");
  await page.getByRole("button", { name: "Change status", exact: true }).click();

  await expect(page.getByRole("heading", { name: /Nusrat Jahan/, level: 1 })).toContainText("Left");
  await expect(page.getByTestId("membership")).toContainText("Left");
  await expect(page.getByText("Active → Left — Moved to Chattogram")).toBeVisible();
  await expect(page.getByRole("button", { name: "Add to batch" })).toHaveCount(0);
});
