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

test("E3: the instructor enters Physics marks in their batch — parts, decimals and Absent (D24, D104, D106)", async ({ page }) => {
  await signIn(page, TEACHER.email, TEACHER.password);
  await expect(page).toHaveURL(url("/app/instructor"));
  await page.getByRole("link", { name: "Exams", exact: true }).click();
  await page.getByTestId("exams-list").getByRole("link", { name: /Model test 1/ }).click();
  const papers = page.getByTestId("exam-papers");
  await expect(papers.getByRole("row", { name: /Chemistry/ }).getByRole("link")).toHaveCount(0); // not their subject
  await papers.getByRole("row", { name: /Physics/ }).getByRole("link", { name: "Enter marks" }).click();

  await expect(page.getByTestId("marks-progress")).toHaveText("0 of 3 entered");
  await page.getByLabel("Anika Rahman Written").fill("60");
  await page.getByLabel("Anika Rahman MCQ").fill("25");
  await page.getByLabel("Bushra Khan absent").check();
  await page.getByLabel("Chaity Das Written").fill("20");
  await page.getByLabel("Chaity Das MCQ").fill("9.5");
  await page.getByRole("button", { name: "Save 3 changes" }).click();
  await expect(page.getByText("3 marks saved.")).toBeVisible();
  await expect(page.getByTestId("marks-progress")).toHaveText("3 of 3 entered");

  await page.getByLabel("Anika Rahman MCQ").fill("31");
  await page.getByRole("button", { name: "Save 1 change" }).click();
  await expect(page.getByText("Anika Rahman's MCQ mark can't be more than 30.")).toBeVisible();
});

test("E3: the Owner enters Chemistry marks; Physics is now locked in the exam form (D101)", async ({ page }) => {
  await signInAsOwner(page);
  await page.goto(url("/app/exams"));
  await page.getByTestId("exams-list").getByRole("link", { name: /Model test 1/ }).click();
  await page.getByTestId("exam-papers").getByRole("row", { name: /Chemistry/ }).getByRole("link", { name: "Enter marks" }).click();
  await page.getByLabel("Anika Rahman Marks").fill("40");
  await page.getByLabel("Bushra Khan Marks").fill("30");
  await page.getByRole("button", { name: "Save 2 changes" }).click();
  await expect(page.getByText("2 marks saved.")).toBeVisible();

  await page.getByRole("link", { name: /Model test 1/ }).click();
  await page.getByRole("link", { name: "Edit" }).click();
  await expect(page.getByTestId("paper-Physics").getByText("Has marks")).toBeVisible();
  await expect(page.locator("#paper-full-0")).toBeDisabled();
});

// By now: Physics — Anika 60 + 25, Bushra Absent, Chaity 20 + 9.5 (below both part pass marks);
// Chemistry (optional) — Anika 40, Bushra 30, Chaity not taken.
test("E4: the Owner reviews the combined merit list and publishes the whole exam (D103, D108, D110)", async ({ page }) => {
  await signInAsOwner(page);
  await page.goto(url("/app/exams"));
  await page.getByTestId("exams-list").getByRole("link", { name: /Model test 1/ }).click();
  await page.getByRole("link", { name: "Results" }).click();

  const results = page.getByTestId("results");
  await expect(results.getByTestId(`result-${codes[0]}`)).toContainText("Passed");
  await expect(results.getByTestId(`result-${codes[0]}`)).toContainText("5.00"); // 4th-subject bonus, capped
  await expect(results.getByTestId(`result-${codes[1]}`)).toContainText("Failed"); // absent from a compulsory paper
  await expect(results.getByTestId(`result-${codes[2]}`)).toContainText("Failed");
  await expect(results.getByRole("row").nth(1)).toContainText("Anika Rahman");

  const [merit] = await Promise.all([page.waitForEvent("popup"), page.getByRole("link", { name: "Print merit list" }).click()]);
  await expect(merit.getByText("DRAFT — not published")).toBeVisible();
  await merit.close();

  await page.getByRole("button", { name: "Publish results" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Publish results" }).click();
  await expect(page.getByText("Results published.")).toBeVisible();
  await expect(page.getByText("Published", { exact: true })).toBeVisible();

  const [sheet] = await Promise.all([page.waitForEvent("popup"), results.getByTestId(`result-${codes[0]}`).getByRole("link", { name: "Marksheet" }).click()]);
  await expect(sheet.getByTestId("marksheet-result")).toHaveText("Passed");
  await expect(sheet.getByText("1 of 3")).toBeVisible();
});

test("E4: the instructor sees the results of their batch but can't publish or change marks (D24, D107)", async ({ page }) => {
  await signIn(page, TEACHER.email, TEACHER.password);
  await expect(page).toHaveURL(url("/app/instructor"));
  await page.goto(url("/app/instructor/exams"));
  await page.getByTestId("exams-list").getByRole("link", { name: /Model test 1/ }).click();
  await page.getByRole("link", { name: "Results" }).click();
  await expect(page.getByTestId("results").getByText("Anika Rahman")).toBeVisible();
  await expect(page.getByRole("button", { name: "Publish results" })).toHaveCount(0);
  await page.getByRole("link", { name: /Model test 1/ }).first().click();
  await page.getByTestId("exam-papers").getByRole("row", { name: /Physics/ }).getByRole("link", { name: "Marks" }).click();
  await expect(page.getByText(/Ask an Owner or Admin to correct a mark/)).toBeVisible();
});

test("E4: the student sees the published result with position and prints the marksheet (D27)", async ({ page }) => {
  await signIn(page, codes[0], "Student123");
  await expect(page).toHaveURL(url("/app/student"));
  await page.getByRole("link", { name: "Results", exact: true }).click();
  const mine = page.getByTestId("my-results");
  await expect(mine).toContainText("Model test 1 (SSC)");
  await expect(mine).toContainText("Position 1 of 3");
  const [sheet] = await Promise.all([page.waitForEvent("popup"), mine.getByRole("link", { name: "Marksheet" }).click()]);
  await expect(sheet.getByTestId("marksheet-result")).toHaveText("Passed");
});

test("E4: the Owner corrects a published mark with a reason; the result and positions update (D107)", async ({ page }) => {
  await signInAsOwner(page);
  await page.goto(url("/app/exams"));
  await page.getByTestId("exams-list").getByRole("link", { name: /Model test 1/ }).click();
  await page.getByTestId("exam-papers").getByRole("row", { name: /Physics/ }).getByRole("link", { name: "Marks" }).click();
  await page.getByLabel("Chaity Das Written").fill("25");
  await page.getByLabel("Chaity Das MCQ").fill("10");
  await expect(page.getByRole("button", { name: "Save 1 change" })).toBeDisabled(); // a reason is needed
  await page.getByLabel("Reason for correcting published marks").fill("Re-checked the script");
  await page.getByRole("button", { name: "Save 1 change" }).click();
  await expect(page.getByText("1 mark saved.")).toBeVisible();

  await page.getByRole("link", { name: /Model test 1/ }).first().click();
  await page.getByRole("link", { name: "Results" }).click();
  const chaity = page.getByTestId(`result-${codes[2]}`);
  await expect(chaity).toContainText("Passed");
  await expect(page.getByTestId("results").getByRole("row").nth(2)).toContainText("Chaity Das"); // now second
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
