import { expect, test, type Page } from "@playwright/test";
import { clearRateLimits, instituteUrl, seedInstitute, seedTeaching, setInstituteModules } from "./helpers";

// One serial story for the Attendance & Leave module; each milestone (A2–A4) adds its steps.
test.describe.configure({ mode: "serial" });

const INSTITUTE = {
  name: "Projonmo Coaching",
  subdomain: "projonmo",
  ownerName: "Nasima Akter",
  ownerEmail: "owner@projonmo.test",
  password: "TempPass12",
  modules: ["attendance"],
};
const OWNER_PASSWORD = "OwnerChosen123";
const TEACHER = { fullName: "Kamal Hossain", email: "kamal@projonmo.test", password: "TeachPass12" };
const url = (path: string) => instituteUrl(INSTITUTE.subdomain, path);
let codes: string[] = [];

async function signIn(page: Page, email: string, password: string) {
  await clearRateLimits();
  await page.goto(url("/login"));
  await page.getByLabel("Email, mobile number or student ID").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

/** Moves to the previous day and waits for its classes, so a click never lands on the day before. */
async function previousDay(page: Page) {
  await page.getByRole("button", { name: "Previous day" }).click();
  await expect(page.getByText(/^Classes on /)).toBeVisible();
}

const mark = (page: Page, code: string, status: "Present" | "Absent" | "Late" | "Excused") =>
  page.getByTestId(`row-${code}`).getByRole("radio", { name: status, exact: true }).click();

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
});

test("an instructor takes today's register for their own subject: everyone starts Present (D81, D83)", async ({ page }) => {
  await signIn(page, TEACHER.email, TEACHER.password);
  await expect(page).toHaveURL(url("/app/instructor"));
  await page.getByRole("link", { name: "Today's attendance" }).click();

  const classes = page.getByTestId("day-classes");
  await expect(classes.getByText("Physics")).toBeVisible();
  await expect(classes.getByText("Chemistry")).toHaveCount(0); // taught by nobody here, so not theirs
  await classes.getByRole("link", { name: /Physics/ }).click();

  await expect(page.getByTestId("register-counts")).toHaveText("Present 3 · Absent 0 · Late 0 · Excused 0");
  await mark(page, codes[1], "Absent");
  await mark(page, codes[2], "Late");
  await page.getByRole("button", { name: "Save register" }).click();
  await expect(page.getByText("Register saved.")).toBeVisible();
  await expect(page.getByText("Taken", { exact: true })).toBeVisible();

  // A same-day change is allowed.
  await mark(page, codes[2], "Present");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Register updated.")).toBeVisible();

  await page.getByRole("link", { name: /Classes on/ }).click();
  await expect(classes.getByText("2 present, 1 absent")).toBeVisible();
});

test("an instructor can't take a past day's register (D82, D84)", async ({ page }) => {
  await signIn(page, TEACHER.email, TEACHER.password);
  await expect(page).toHaveURL(url("/app/instructor"));
  await page.goto(url("/app/instructor/attendance"));
  await previousDay(page);
  await page.getByTestId("day-classes").getByRole("link", { name: /Physics/ }).click();
  await expect(page.getByText(/Ask an Admin to correct it/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Save register" })).toHaveCount(0);
  await expect(page.getByTestId(`row-${codes[0]}`).getByRole("radio", { name: "Absent", exact: true })).toBeDisabled();
});

test("the Owner takes a missed register with a reason, marks a class not held, and adds an extra class (D84–D86)", async ({ page }) => {
  await signIn(page, INSTITUTE.ownerEmail, OWNER_PASSWORD);
  await expect(page).toHaveURL(url("/app"));
  await page.getByRole("link", { name: "Attendance", exact: true }).click();
  const classes = page.getByTestId("day-classes");
  await expect(classes.getByText("Chemistry")).toBeVisible(); // the office sees every class

  await previousDay(page);
  await classes.getByRole("link", { name: /Physics/ }).click();
  const save = page.getByRole("button", { name: "Save register" });
  await expect(save).toBeDisabled(); // a reason is needed after the class day
  await mark(page, codes[0], "Absent");
  await page.getByLabel("Reason for changing a past day's register").fill("Taken on paper");
  await save.click();
  await expect(page.getByText("Register saved.")).toBeVisible();

  await page.getByRole("link", { name: /Classes on/ }).click();
  await page.getByRole("button", { name: "Today" }).click();
  await expect(page.getByText(/^Today's classes/)).toBeVisible();
  await classes.getByRole("link", { name: /Chemistry/ }).click();
  await page.getByRole("button", { name: "No class held" }).click();
  await page.getByRole("alertdialog").getByLabel("Reason").fill("Instructor ill");
  await page.getByRole("button", { name: "Mark not held" }).click();
  await expect(page.getByText("Marked as no class held.")).toBeVisible();
  await expect(page.getByText(/Instructor ill/)).toBeVisible();

  await page.getByRole("link", { name: /Classes on/ }).click();
  await page.getByRole("button", { name: "Extra class" }).click();
  await page.getByLabel("Batch and subject", { exact: true }).click();
  await page.getByRole("option", { name: "Evening · Physics" }).click();
  await page.getByLabel("Starts").fill("19:00");
  await page.getByLabel("Ends").fill("20:00");
  await page.getByRole("button", { name: "Add class" }).click();
  await expect(classes.getByText(/Extra class/)).toBeVisible();
  await expect(classes.getByText("No class held")).toBeVisible();
});

test("Attendance disappears while the module is off (D5)", async ({ page }) => {
  await setInstituteModules(INSTITUTE.subdomain, { attendance: false });
  try {
    await signIn(page, INSTITUTE.ownerEmail, OWNER_PASSWORD);
    await expect(page).toHaveURL(url("/app"));
    await expect(page.getByRole("link", { name: "Attendance", exact: true })).toHaveCount(0);
    const res = await page.goto(url("/app/attendance"));
    expect(res?.status()).toBe(404);
  } finally {
    await setInstituteModules(INSTITUTE.subdomain, { attendance: true });
  }
});
