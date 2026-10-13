import { expect, test, type Page } from "@playwright/test";
import { clearRateLimits, instituteUrl, seedInstitute, seedTeaching, setInstituteModules } from "./helpers";

// One serial story for the Exams & Results module; each milestone (E2–E4) adds its steps.
test.describe.configure({ mode: "serial" });

const INSTITUTE = {
  name: "Medha Coaching",
  subdomain: "medha",
  ownerName: "Farid Ahmed",
  ownerEmail: "owner@medha.test",
  password: "TempPass12",
  modules: ["exams"],
};
const OWNER_PASSWORD = "OwnerChosen123";
const TEACHER = { fullName: "Selina Parvin", email: "selina@medha.test", password: "TeachPass12" };
const url = (path: string) => instituteUrl(INSTITUTE.subdomain, path);
let codes: string[] = [];

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

async function pick(page: Page, label: string, option: string) {
  await page.getByLabel(label, { exact: true }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

test.beforeAll(async () => {
  await seedInstitute(INSTITUTE);
  ({ codes } = await seedTeaching({ subdomain: INSTITUTE.subdomain, instructor: TEACHER, subjects: ["Physics", "Chemistry"], students: ["Anika Rahman", "Bushra Khan", "Chaity Das"] }));
});

test("the Owner signs in for the first time", async ({ page }) => {
  await signIn(page, INSTITUTE.ownerEmail, INSTITUTE.password);
  await page.getByLabel("Current (temporary) password").fill(INSTITUTE.password);
  await page.getByLabel("New password", { exact: true }).fill(OWNER_PASSWORD);
  await page.getByLabel("Confirm new password").fill(OWNER_PASSWORD);
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(page).toHaveURL(url("/app"));
  expect(codes).toHaveLength(3);
});

test("E2: the Owner creates a model test with a split paper and an optional paper (D101, D108)", async ({ page }) => {
  await signInAsOwner(page);
  await page.getByRole("link", { name: "Exams", exact: true }).click();
  await page.getByRole("link", { name: "New exam" }).click();
  await pick(page, "Course", "SSC Science (SSC)");
  await page.getByLabel("Exam name").fill("Model test 1");
  await pick(page, "Kind", "Model test");
  await page.getByLabel("First day").fill("2026-11-01");
  await page.getByLabel("Last day").fill("2026-11-02");
  await page.getByLabel("Evening").check();

  await pick(page, "Add a paper", "Physics");
  await page.getByRole("button", { name: "Add paper" }).click();
  const physics = page.getByTestId("paper-Physics");
  await physics.getByRole("button", { name: "Split into parts" }).click();
  await page.locator("#part-full-0-0").fill("70");
  await page.locator("#part-pass-0-0").fill("23");
  await page.locator("#part-full-0-1").fill("30");
  await page.locator("#part-pass-0-1").fill("10");
  await pick(page, "Add a paper", "Chemistry");
  await page.getByRole("button", { name: "Add paper" }).click();
  await page.locator("#paper-full-1").fill("50");
  await page.locator("#paper-pass-1").fill("17");
  await page.getByLabel("Optional (4th subject)").nth(1).check();
  await page.getByRole("button", { name: "Create exam" }).click();

  await expect(page.getByRole("heading", { name: "Model test 1", level: 1 })).toBeVisible();
  const papers = page.getByTestId("exam-papers");
  await expect(papers.getByRole("row", { name: /Physics/ })).toContainText("Written 70 (pass 23) · MCQ 30 (pass 10)");
  await expect(papers.getByRole("row", { name: /Chemistry/ })).toContainText("(optional)");
  await expect(page.getByText("Draft", { exact: true })).toBeVisible();
});

test("E2: a wrong split is refused with a clear message, and the exam can be edited", async ({ page }) => {
  await signInAsOwner(page);
  await page.goto(url("/app/exams"));
  await page.getByTestId("exams-list").getByRole("link", { name: /Model test 1/ }).click();
  await page.getByRole("link", { name: "Edit" }).click();
  await page.locator("#part-full-0-1").fill("20");
  await page.getByRole("button", { name: "Save exam" }).click();
  await expect(page.getByText("The parts' full marks must add up to the paper's full marks.").last()).toBeVisible();
  await page.locator("#part-full-0-1").fill("30");
  await page.getByLabel("Exam name").fill("Model test 1 (SSC)");
  await page.getByRole("button", { name: "Save exam" }).click();
  await expect(page.getByRole("heading", { name: "Model test 1 (SSC)", level: 1 })).toBeVisible();
});

test("E2: the grading scale can be changed and set back to Bangladesh 5.0 (D102, D112)", async ({ page }) => {
  await signInAsOwner(page);
  await page.goto(url("/app/exams"));
  await page.getByRole("link", { name: "Grading scale" }).click();
  await expect(page.getByText("Bangladesh 5.0 (default)")).toBeVisible();
  await page.getByLabel("From percent 1").fill("85");
  await page.getByRole("button", { name: "Save scale" }).click();
  await expect(page.getByText("Grading scale saved.")).toBeVisible();
  await expect(page.getByText("Bangladesh 5.0 (default)")).toHaveCount(0);
  await page.getByRole("button", { name: "Use the Bangladesh 5.0 scale" }).click();
  await page.getByRole("button", { name: "Use default scale" }).click();
  await expect(page.getByText("The Bangladesh 5.0 scale is back.")).toBeVisible();
  await expect(page.getByLabel("From percent 1")).toHaveValue("80");
});

test("Exams disappear while the module is off (D5)", async ({ page }) => {
  await setInstituteModules(INSTITUTE.subdomain, { exams: false });
  try {
    await signInAsOwner(page);
    await expect(page.getByRole("link", { name: "Exams", exact: true })).toHaveCount(0);
    const res = await page.goto(url("/app/exams"));
    expect(res?.status()).toBe(404);
  } finally {
    await setInstituteModules(INSTITUTE.subdomain, { exams: true });
  }
});
