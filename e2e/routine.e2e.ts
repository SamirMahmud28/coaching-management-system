import { expect, test, type Page } from "@playwright/test";
import { clearRateLimits, instituteUrl, seedInstitute, seedTeaching, setInstituteModules } from "./helpers";

// One serial story for the Routine & Lesson Plans module; each milestone (R2–R4) adds its steps.
test.describe.configure({ mode: "serial" });

const INSTITUTE = {
  name: "Alokito Coaching",
  subdomain: "alokito",
  ownerName: "Jahid Hasan",
  ownerEmail: "owner@alokito.test",
  password: "TempPass12",
  modules: ["routine"],
};
const OWNER_PASSWORD = "OwnerChosen123";
const TEACHER = { fullName: "Mitu Akter", email: "mitu@alokito.test", password: "TeachPass12" };
const SUBSTITUTE = { fullName: "Nasrin Sultana", email: "nasrin@alokito.test", password: "TeachPass12" };
const url = (path: string) => instituteUrl(INSTITUTE.subdomain, path);
const day = (offset: number) => new Date(Date.now() + 6 * 3_600_000 + offset * 86_400_000).toISOString().slice(0, 10); // Bangladesh date

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

/** Opens the routine's Day view on a date. */
async function openDay(page: Page, date: string) {
  await page.goto(url("/app/routine"));
  await page.getByLabel("From").fill(date);
  await expect(page.getByTestId("routine-classes")).toBeVisible();
}

const cls = (page: Page, subject: string, date: string, time: string) => page.getByTestId(`class-${subject}-${date}-${time}`);

test.beforeAll(async () => {
  await seedInstitute(INSTITUTE);
  await seedTeaching({ subdomain: INSTITUTE.subdomain, instructor: TEACHER, extraInstructors: [SUBSTITUTE], subjects: ["Physics", "Chemistry"], students: ["Anika Rahman", "Bushra Khan"] });
});

test("the Owner signs in for the first time", async ({ page }) => {
  await signIn(page, INSTITUTE.ownerEmail, INSTITUTE.password);
  await page.getByLabel("Current (temporary) password").fill(INSTITUTE.password);
  await page.getByLabel("New password", { exact: true }).fill(OWNER_PASSWORD);
  await page.getByLabel("Confirm new password").fill(OWNER_PASSWORD);
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(page).toHaveURL(url("/app"));
});

test("R2: the Owner cancels a class with a reason and undoes it (D114, D115)", async ({ page }) => {
  await signInAsOwner(page);
  await page.getByRole("link", { name: "Routine", exact: true }).click();
  const tomorrow = day(1);
  await openDay(page, tomorrow);
  const physics = cls(page, "Physics", tomorrow, "16:00");
  await physics.getByRole("button", { name: "Change" }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog.getByRole("button", { name: "Save change" })).toBeDisabled(); // a cancellation needs a reason
  await dialog.getByLabel("Reason").fill("Instructor ill");
  await dialog.getByRole("button", { name: "Save change" }).click();
  await expect(page.getByText("Class cancelled.")).toBeVisible();
  await expect(physics).toContainText("Cancelled");
  await expect(physics).toContainText("Instructor ill");

  await physics.getByRole("button", { name: "Undo change" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Undo change" }).click();
  await expect(page.getByText("Change withdrawn.")).toBeVisible();
  await expect(physics.getByRole("button", { name: "Change" })).toBeVisible();
});

test("R2: a substitute takes one class and another class moves to a free time (D114, D51)", async ({ page }) => {
  await signInAsOwner(page);
  const date = day(2);
  await openDay(page, date);
  await cls(page, "Physics", date, "16:00").getByRole("button", { name: "Change" }).click();
  let dialog = page.getByRole("alertdialog");
  await dialog.getByLabel("What changes").click();
  await page.getByRole("option", { name: "Another instructor takes it" }).click();
  await dialog.getByLabel("Substitute").click();
  await page.getByRole("option", { name: SUBSTITUTE.fullName }).click();
  await dialog.getByRole("button", { name: "Save change" }).click();
  await expect(page.getByText("Substitute set.")).toBeVisible();
  await expect(cls(page, "Physics", date, "16:00")).toContainText(`Substitute: ${SUBSTITUTE.fullName}`);

  await cls(page, "Chemistry", date, "17:30").getByRole("button", { name: "Change" }).click();
  dialog = page.getByRole("alertdialog");
  await dialog.getByLabel("What changes").click();
  await page.getByRole("option", { name: "Move it to another time" }).click();
  await dialog.getByLabel("Starts").fill("19:00");
  await dialog.getByLabel("Ends").fill("20:00");
  await dialog.getByRole("button", { name: "Save change" }).click();
  await expect(page.getByText("Class rescheduled.")).toBeVisible();
  await expect(cls(page, "Chemistry", date, "17:30")).toContainText("Moved to");
  await expect(cls(page, "Chemistry", date, "19:00")).toContainText("Moved here");
});

test("R2: a holiday closes every class that day and appears in Changes & holidays (D114)", async ({ page }) => {
  await signInAsOwner(page);
  await page.goto(url("/app/routine"));
  await page.getByRole("button", { name: "Changes & holidays" }).click();
  await page.getByRole("button", { name: "Add holiday" }).click();
  const dialog = page.getByRole("alertdialog");
  const date = day(3);
  await dialog.getByLabel("Name").fill("Victory Day");
  await dialog.getByLabel("First day").fill(date);
  await dialog.getByLabel("Last day").fill(date);
  await dialog.getByRole("button", { name: "Add holiday" }).click();
  await expect(page.getByText("Holiday added.")).toBeVisible();
  await expect(page.getByTestId("holidays")).toContainText("Victory Day");
  await expect(page.getByTestId("changes")).toContainText("Substitute: Nasrin Sultana");

  await page.getByRole("button", { name: "Day", exact: true }).click();
  await page.getByLabel("From").fill(date);
  await expect(cls(page, "Physics", date, "16:00")).toContainText("Holiday");
  await expect(cls(page, "Chemistry", date, "17:30")).toContainText("Victory Day");
});

test("R3: the Owner builds a lesson plan; a late topic shows Overdue and completing it counts (D118, D119)", async ({ page }) => {
  await signInAsOwner(page);
  await page.goto(url("/app/routine"));
  await page.getByRole("link", { name: "Lesson plans" }).click();
  await page.getByTestId("lesson-overview").getByRole("link", { name: /Physics/ }).click();
  await expect(page.getByText("No topics yet").first()).toBeVisible();

  const add = page.getByTestId("add-topic");
  await add.getByLabel("Chapter or topic").fill("Ch 1: Vectors");
  await add.getByLabel("Target").fill(day(-3));
  await add.getByRole("button", { name: "Add topic" }).click();
  await expect(page.getByTestId("topic-Ch 1: Vectors")).toContainText("Overdue");
  await add.getByLabel("Chapter or topic").fill("Ch 2: Motion");
  await add.getByRole("button", { name: "Add topic" }).click();
  await expect(page.getByTestId("topic-Ch 2: Motion")).toBeVisible();

  await page.getByLabel("Ch 1: Vectors status").click();
  await page.getByRole("option", { name: "Completed" }).click();
  await expect(page.getByTestId("topic-Ch 1: Vectors")).not.toContainText("Overdue");
  await expect(page.getByText("1 of 2 topics completed")).toBeVisible();

  await page.getByRole("button", { name: "Move Ch 2: Motion up" }).click();
  await expect(page.getByTestId("lesson-topics").getByRole("listitem").first()).toContainText("Ch 2: Motion");
});

test("Routine disappears while the module is off (D5)", async ({ page }) => {
  await setInstituteModules(INSTITUTE.subdomain, { routine: false });
  try {
    await signInAsOwner(page);
    await expect(page.getByRole("link", { name: "Routine", exact: true })).toHaveCount(0);
    const res = await page.goto(url("/app/routine"));
    expect(res?.status()).toBe(404);
  } finally {
    await setInstituteModules(INSTITUTE.subdomain, { routine: true });
  }
});
