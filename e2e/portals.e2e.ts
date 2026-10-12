import { expect, test, type Page } from "@playwright/test";
import { clearRateLimits, instituteUrl, seedInstitute, setInstituteStatus } from "./helpers";

// One serial story: each test builds on the previous one's data.
test.describe.configure({ mode: "serial" });
test.use({ permissions: ["clipboard-read", "clipboard-write"] });

const INSTITUTE = {
  name: "Prottoy Academic Care",
  subdomain: "prottoy",
  ownerName: "Shirin Akter",
  ownerEmail: "owner@prottoy.test",
  password: "TempPass12",
  modules: [],
};
const OWNER_PASSWORD = "OwnerChosen123";
const url = (path: string) => instituteUrl(INSTITUTE.subdomain, path);
const instructor = { phone: "01911556677", password: "" };
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

async function pick(page: Page, label: string, option: string) {
  await page.getByLabel(label, { exact: true }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

test.beforeAll(async () => {
  await seedInstitute(INSTITUTE);
});

test("the Owner sets up an instructor, a batch with a class time, and a student", async ({ page }) => {
  await signIn(page, INSTITUTE.ownerEmail, INSTITUTE.password);
  await changePassword(page, INSTITUTE.password, OWNER_PASSWORD);
  await expect(page).toHaveURL(url("/app"));

  await page.goto(url("/app/instructors"));
  await page.getByRole("button", { name: "New instructor" }).first().click();
  await page.getByLabel("Full name").fill("Mahbub Alam");
  await page.getByLabel("Mobile number").fill(instructor.phone);
  await page.getByRole("button", { name: "Generate" }).click();
  await page.getByRole("button", { name: "Add instructor" }).click();
  instructor.password = (await page.getByTestId("one-time-password").textContent()) ?? "";
  await page.getByRole("button", { name: "Done" }).click();

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
  await pick(page, "Subject to add", "Physics");
  await page.getByRole("button", { name: "Add subject" }).click();
  const card = page.getByTestId("batch-subject").filter({ hasText: "Physics" });
  await card.getByRole("button", { name: "Physics actions" }).click();
  await page.getByRole("menuitem", { name: "Choose instructors" }).click();
  await page.getByRole("dialog").getByLabel("Mahbub Alam").check();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await card.getByLabel("Day").click();
  await page.getByRole("option", { name: "Saturday", exact: true }).click();
  await card.getByLabel("Starts").fill("16:00");
  await card.getByLabel("Ends").fill("17:30");
  await card.getByRole("button", { name: "Add class time" }).click();
  await expect(card).toContainText("16:00–17:30");

  await page.goto(url("/app/students/new"));
  await page.getByLabel("Full name").fill("Nusrat Jahan");
  await pick(page, "Gender", "Female");
  await page.getByLabel("School or college").fill("Holy Cross College");
  await page.getByLabel("Guardian's name").fill("Abdul Karim");
  await pick(page, "Relation", "Father");
  await page.getByLabel("Guardian's mobile").fill("01711223344");
  await page.getByLabel(/Morning/).check();
  await page.getByRole("button", { name: "Generate" }).click();
  await page.getByRole("button", { name: "Admit student" }).click();
  student.id = (await page.getByTestId("sign-in-id").textContent()) ?? "";
  student.password = (await page.getByTestId("one-time-password").textContent()) ?? "";
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.getByTestId("student-code")).toHaveText(student.id);

  // Dashboard counts.
  await page.goto(url("/app"));
  const glance = page.getByRole("region", { name: "At a glance" });
  await expect(glance.getByRole("link", { name: /1\s*Active students/ })).toBeVisible();
  await expect(glance.getByRole("link", { name: /1\s*Active batches/ })).toBeVisible();
  await expect(glance.getByRole("link", { name: /1\s*Active instructors/ })).toBeVisible();
});

test("the public page lists the course, its batch and class times, without instructor names (D59)", async ({ page }) => {
  await page.goto(url("/"));
  await expect(page.getByRole("heading", { level: 1, name: INSTITUTE.name })).toBeVisible();
  const course = page.getByTestId("public-course").filter({ hasText: "HSC 2026 Science" });
  await expect(course).toContainText("Subjects: Physics");
  await expect(course).toContainText("Morning");
  await expect(course).toContainText("Saturday 16:00–17:30 · Physics");
  await expect(page.getByText("Mahbub Alam")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
});

test("the instructor sees their batch, its students without contact details, and their week (D24, D60)", async ({ page }) => {
  await signIn(page, instructor.phone, instructor.password);
  await changePassword(page, instructor.password, "Teach12345");
  await expect(page).toHaveURL(url("/app/instructor"));
  await expect(page.getByText("Saturday")).toBeVisible();
  await expect(page.getByText("16:00–17:30")).toBeVisible();
  await page.getByRole("link", { name: /Morning/ }).click();

  await expect(page.getByRole("heading", { name: "Morning", level: 1 })).toBeVisible();
  const roster = page.getByTestId("roster");
  await expect(roster).toContainText("Nusrat Jahan");
  await expect(roster).toContainText(student.id);
  await expect(roster).toContainText("Holy Cross College");
  await expect(page.getByText("01711223344")).toHaveCount(0);
  await expect(page.getByText("Abdul Karim")).toHaveCount(0);

  // Admin pages and other batches stay closed.
  await page.goto(url("/app/students"));
  await expect(page).toHaveURL(url("/app/instructor"));
  await page.goto(url("/app/instructor/batches/00000000-0000-4000-8000-000000000000"));
  await expect(page.getByText("Page not found")).toBeVisible();
});

test("the student sees their batch, subject, instructor and class times (D27)", async ({ page }) => {
  await signIn(page, student.id, student.password);
  await changePassword(page, student.password, "Student12345");
  await expect(page).toHaveURL(url("/app/student"));
  const batch = page.getByTestId("my-batch");
  await expect(batch).toContainText("Morning");
  await expect(batch).toContainText("Physics");
  await expect(batch).toContainText("Mahbub Alam");
  await expect(batch).toContainText("Sat 16:00–17:30");
  await expect(page.getByText(student.id)).toBeVisible();
});

test("a suspended institute keeps its public page; a deactivated one shows it isn't available (D58)", async ({ page }) => {
  await setInstituteStatus(INSTITUTE.subdomain, "SUSPENDED");
  await page.goto(url("/"));
  await expect(page.getByTestId("public-course")).toContainText("HSC 2026 Science");
  await setInstituteStatus(INSTITUTE.subdomain, "DEACTIVATED");
  await page.goto(url("/"));
  await expect(page.getByRole("heading", { name: "This page isn't available" })).toBeVisible();
  await expect(page.getByText("HSC 2026 Science")).toHaveCount(0);
  await setInstituteStatus(INSTITUTE.subdomain, "ACTIVE");
});
