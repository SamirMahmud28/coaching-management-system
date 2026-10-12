import { expect, test, type Page } from "@playwright/test";
import { clearRateLimits, instituteUrl, seedInstitute, setInstituteModules } from "./helpers";

// One serial story for the Fees module; each milestone (F2–F6) adds its steps.
test.describe.configure({ mode: "serial" });
test.use({ permissions: ["clipboard-read", "clipboard-write"] });

const INSTITUTE = {
  name: "Shikkha Coaching Home",
  subdomain: "shikkha",
  ownerName: "Rafiq Islam",
  ownerEmail: "owner@shikkha.test",
  password: "TempPass12",
  modules: ["fees"],
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

async function signInAsOwner(page: Page) {
  await signIn(page, OWNER_PASSWORD);
  await expect(page).toHaveURL(url("/app"));
}

async function pick(page: Page, label: string, option: string) {
  await page.getByLabel(label, { exact: true }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

test.beforeAll(async () => {
  await seedInstitute(INSTITUTE);
});

test("the Owner sets up a course with a batch and a student", async ({ page }) => {
  await signIn(page, INSTITUTE.password);
  await page.getByLabel("Current (temporary) password").fill(INSTITUTE.password);
  await page.getByLabel("New password", { exact: true }).fill(OWNER_PASSWORD);
  await page.getByLabel("Confirm new password").fill(OWNER_PASSWORD);
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(page).toHaveURL(url("/app"));

  await page.goto(url("/app/courses"));
  await page.getByRole("button", { name: "New course" }).first().click();
  await page.getByLabel("Course name").fill("HSC 2026 Science");
  await page.getByLabel("Short code").fill("HSC26");
  await pick(page, "Monthly fee due day", "Day 10");
  await page.getByRole("button", { name: "Add course" }).click();
  await page.getByRole("button", { name: "Add subject" }).click();
  await page.getByLabel("Subject name").fill("Physics");
  await page.getByRole("dialog").getByRole("button", { name: "Add subject" }).click();
  await page.getByRole("button", { name: "New batch" }).click();
  await page.getByLabel("Batch name").fill("Morning");
  await page.getByRole("button", { name: "Add batch" }).click();
  await expect(page.getByRole("heading", { name: /Morning/, level: 1 })).toBeVisible();

  await page.goto(url("/app/students/new"));
  await page.getByLabel("Full name").fill("Tania Akter");
  await pick(page, "Gender", "Female");
  await page.getByLabel("Guardian's name").fill("Abdul Karim");
  await pick(page, "Relation", "Father");
  await page.getByLabel("Guardian's mobile").fill("01711223344");
  await page.getByLabel(/Morning/).check();
  await page.getByRole("button", { name: "Generate" }).click();
  await page.getByRole("button", { name: "Admit student" }).click();
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.getByRole("heading", { name: /Tania Akter/, level: 1 })).toBeVisible();
});

test("F2: the Owner adds the course's fees and sets the receipt prefix (D28, D38)", async ({ page }) => {
  await signInAsOwner(page);
  await page.getByRole("navigation").first().getByRole("link", { name: "Fees" }).click();
  await expect(page.getByRole("heading", { name: "Fees", level: 1 })).toBeVisible();
  const course = page.getByTestId("course-fees").filter({ hasText: "HSC 2026 Science" });
  await expect(course).toContainText("due on day 10");

  await course.getByRole("button", { name: "Add fee" }).click();
  await page.getByLabel("Name").fill("Tuition");
  await page.getByLabel("Amount (৳)").fill("2000");
  await page.getByRole("dialog").getByRole("button", { name: "Add fee" }).click();
  await expect(course).toContainText("৳2,000.00");

  await course.getByRole("button", { name: "Add fee" }).click();
  await pick(page, "Kind", "Admission (one-time)");
  await page.getByLabel("Name").fill("Admission");
  await page.getByLabel("Amount (৳)").fill("1500");
  await page.getByRole("dialog").getByRole("button", { name: "Add fee" }).click();
  await expect(course).toContainText("Admission (one-time)");

  await course.getByRole("button", { name: "Tuition actions" }).click();
  await page.getByRole("menuitem", { name: "Edit" }).click();
  await page.getByLabel("Amount (৳)").fill("2200");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(course).toContainText("৳2,200.00");
  await expect(page.getByRole("dialog")).toHaveCount(0);

  const prefix = page.getByLabel("Receipt prefix");
  await expect(prefix).toHaveValue("R"); // loaded before typing, so the edit isn't overwritten
  await prefix.fill("shk");
  await expect(page.getByText("SHK-000123")).toBeVisible();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Receipt prefix saved.")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Receipt prefix")).toHaveValue("SHK");
});

test("F2: a student's own amount, with a reason (D29)", async ({ page }) => {
  await signInAsOwner(page);
  await page.goto(url("/app/students"));
  await page.getByRole("row", { name: /Tania Akter/ }).click();
  const amounts = page.getByTestId("fee-amounts");
  await expect(amounts).toContainText("Tuition");
  await amounts.getByRole("listitem").filter({ hasText: "Tuition" }).getByRole("button", { name: "Set own amount" }).click();
  await page.getByLabel("Amount (৳)").fill("1800");
  await page.getByLabel("Reason").fill("Sibling rate");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(amounts).toContainText("৳1,800.00");
  await expect(amounts).toContainText("Own amount: Sibling rate");
});

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const now = new Date(Date.now() + 6 * 3600_000); // Bangladesh date (UTC+6)
const thisMonth = `${MONTHS[now.getUTCMonth()]} ${now.getUTCFullYear()}`;

test("F3: the Owner generates this month's tuition and the admission fee from a preview (D30, D62)", async ({ page }) => {
  await signInAsOwner(page);
  await page.goto(url("/app/fees"));
  await page.getByRole("link", { name: "Generate charges" }).click();
  await pick(page, "Fee", "HSC 2026 Science · Tuition (Monthly)");
  await page.getByRole("button", { name: "Preview" }).click();
  const preview = page.getByTestId("generation-preview");
  await expect(preview).toContainText(`Tuition — ${thisMonth}`);
  await expect(preview).toContainText("Tania Akter");
  await expect(preview).toContainText("own amount");
  await expect(preview.getByLabel("Amount for Tania Akter")).toHaveValue("1800");
  await preview.getByRole("button", { name: "Create 1 charge" }).click();
  await expect(page.getByText(/1 charge created, ৳1,800.00 in all/)).toBeVisible();
  await expect(page.getByTestId("runs")).toContainText("Tuition");

  await pick(page, "Fee", "HSC 2026 Science · Admission (Admission (one-time))");
  await page.getByRole("button", { name: "Preview" }).click();
  await expect(preview).toContainText("Admission — One-time");
  await preview.getByRole("button", { name: "Create 1 charge" }).click();
  await expect(page.getByText(/1 charge created, ৳1,500.00 in all/)).toBeVisible();

  // Generating the same month again charges nobody.
  await pick(page, "Fee", "HSC 2026 Science · Tuition (Monthly)");
  await page.getByRole("button", { name: "Preview" }).click();
  await expect(preview).toContainText("Nobody to charge.");
  await expect(preview).toContainText("Already charged");
});

test("F3: the student's fees page lists the charges; a fine is added and cancelled with reasons (D34, D43)", async ({ page }) => {
  await signInAsOwner(page);
  await page.goto(url("/app/students"));
  await page.getByRole("row", { name: /Tania Akter/ }).click();
  await page.getByRole("link", { name: "Open fees" }).click();
  await expect(page.getByRole("heading", { name: "Tania Akter — fees", level: 1 })).toBeVisible();
  const charges = page.getByTestId("charges");
  await expect(charges).toContainText(`Tuition — ${thisMonth}`);
  await expect(charges).toContainText("Admission");
  await expect(page.getByTestId("due-total")).toHaveText("৳3,300.00");

  await page.getByRole("button", { name: "Add fine" }).click();
  await page.getByLabel("Amount (৳)").fill("100");
  await page.getByLabel("Reason").fill("Damaged lab equipment");
  await page.getByRole("button", { name: "Add fine", exact: true }).last().click();
  await expect(charges).toContainText("Damaged lab equipment");
  await expect(page.getByTestId("due-total")).toHaveText("৳3,400.00");

  await charges.getByRole("listitem").filter({ hasText: "Damaged lab equipment" }).getByRole("button", { name: "Fine actions" }).click();
  await page.getByRole("menuitem", { name: "Cancel" }).click();
  await page.getByLabel("Reason").fill("Equipment was already broken");
  await page.getByRole("button", { name: "Cancel charge" }).click();
  await expect(charges.getByRole("listitem").filter({ hasText: "Damaged lab equipment" })).toContainText("Cancelled");
  await expect(page.getByTestId("due-total")).toHaveText("৳3,300.00");
});

async function openStudentFees(page: Page) {
  await signInAsOwner(page);
  await page.goto(url("/app/students"));
  await page.getByRole("row", { name: /Tania Akter/ }).click();
  await page.getByRole("link", { name: "Open fees" }).click();
  await expect(page.getByRole("heading", { name: "Tania Akter — fees", level: 1 })).toBeVisible();
}

test("F4: collect whole charges in cash and print the receipt (D31, D38, D69)", async ({ page }) => {
  await openStudentFees(page);
  const collect = page.getByTestId("collect");
  await collect.getByLabel(/Tuition/).check();
  await collect.getByLabel(/Admission/).check();
  await expect(page.getByTestId("collect-total")).toHaveText("৳3,300.00");
  await collect.getByRole("button", { name: "Record payment" }).click();
  await expect(collect.getByRole("status")).toContainText("SHK-000001");
  await expect(page.getByTestId("due-total")).toHaveText("৳0.00");

  const [receipt] = await Promise.all([page.waitForEvent("popup"), collect.getByRole("link", { name: "Print receipt" }).click()]);
  await expect(receipt.getByTestId("receipt-number")).toHaveText("SHK-000001");
  await expect(receipt.getByTestId("receipt-total")).toHaveText("৳3,300.00");
  await expect(receipt.getByText("In words: Three thousand three hundred taka only")).toBeVisible();
  await expect(receipt.getByText("HSC 2026 Science · Morning")).toBeVisible();
  await expect(receipt.getByText("Rafiq Islam")).toBeVisible();
  await expect(receipt.getByRole("button", { name: "Print" })).toBeVisible();
});

test("F4: a voided payment makes its charges due again and its receipt prints VOID; re-collected with a new number (D35, D71)", async ({ page }) => {
  await openStudentFees(page);
  const payments = page.getByTestId("payments");
  await payments.getByRole("button", { name: "Void" }).click();
  await page.getByLabel("Reason").fill("Recorded against the wrong student");
  await page.getByRole("button", { name: "Void payment" }).click();
  await expect(payments).toContainText("void: Recorded against the wrong student");
  await expect(page.getByTestId("due-total")).toHaveText("৳3,300.00");

  const [receipt] = await Promise.all([page.waitForEvent("popup"), payments.getByRole("link", { name: "Print" }).click()]);
  await expect(receipt.getByRole("note", { name: "This receipt is void" })).toBeVisible();

  const collect = page.getByTestId("collect");
  await collect.getByLabel(/Tuition/).check();
  await collect.getByLabel(/Admission/).check();
  await pick(page, "Method", "bKash");
  await expect(collect.getByRole("button", { name: "Record payment" })).toBeDisabled(); // reference needed (D39)
  await collect.getByLabel("Reference").fill("BK7Q2X");
  await collect.getByRole("button", { name: "Record payment" }).click();
  await expect(collect.getByRole("status")).toContainText("SHK-000002"); // 000001 is never reused
});

test("F4: a fine is waived by half and paid; a paid charge is partly refunded (D33, D37)", async ({ page }) => {
  await openStudentFees(page);
  await page.getByRole("button", { name: "Add fine" }).click();
  await page.getByLabel("Amount (৳)").fill("200");
  await page.getByLabel("Reason").fill("Late return of library book");
  await page.getByRole("button", { name: "Add fine", exact: true }).last().click();
  const charges = page.getByTestId("charges");
  await charges.getByRole("button", { name: "Fine actions" }).first().click();
  await page.getByRole("menuitem", { name: "Waive" }).click();
  await pick(page, "Waive by", "Percent of the charge");
  await page.getByLabel("Percent", { exact: true }).fill("50");
  await page.getByLabel("Reason").fill("First time");
  await page.getByRole("button", { name: "Add waiver" }).click();
  await expect(page.getByTestId("due-total")).toHaveText("৳100.00");

  const collect = page.getByTestId("collect");
  await collect.getByLabel(/Fine/).check();
  await collect.getByRole("button", { name: "Record payment" }).click();
  await expect(collect.getByRole("status")).toContainText("SHK-000003");

  await charges.getByRole("button", { name: /Tuition .* actions/ }).click();
  await page.getByRole("menuitem", { name: "Refund" }).click();
  await page.getByLabel("Amount (৳)").fill("500");
  await page.getByLabel("Reason").fill("Missed two weeks for illness");
  await page.getByRole("button", { name: "Record refund" }).click();
  await expect(charges.getByRole("listitem").filter({ hasText: "Tuition" })).toContainText("৳500.00 refunded");
  await expect(charges.getByRole("listitem").filter({ hasText: "Tuition" })).toContainText("Paid");
});

test("F5: reports show collections net of refunds with voids apart, and dues; both print (D75–D78)", async ({ page }) => {
  await signInAsOwner(page);
  await page.goto(url("/app/fees"));
  await page.getByRole("link", { name: "Reports" }).click();
  const report = page.getByTestId("collection-report");
  // SHK-000002 (bKash ৳3,300) and SHK-000003 (cash ৳100) count; SHK-000001 was voided; ৳500 was refunded.
  await expect(report).toContainText("SHK-000002");
  await expect(report).toContainText("SHK-000003");
  await expect(page.getByTestId("net")).toHaveText("৳2,900.00");
  await expect(report).toContainText("bKash ৳3,300.00 · Cash ৳100.00");
  await expect(report.getByText("Voided receipts (not in the totals)")).toBeVisible();
  await expect(report).toContainText("Recorded against the wrong student");

  const [printed] = await Promise.all([page.waitForEvent("popup"), page.getByRole("link", { name: "Print" }).click()]);
  await expect(printed.getByText("Fee collection")).toBeVisible();
  await expect(printed.getByText("Net collection")).toBeVisible();
  await printed.close();

  await page.getByRole("tab", { name: "Dues", exact: true }).click();
  await expect(page.getByTestId("dues-report")).toContainText("Nothing is due.");
  await pick(page, "Course", "HSC 2026 Science");
  await pick(page, "Batch", "Morning · HSC 2026 Science");
  await expect(page.getByTestId("dues-report")).toContainText("Nothing is due.");
});

test("F2: with Fees switched off, its page and the student's fee card disappear (D5)", async ({ page }) => {
  await setInstituteModules(INSTITUTE.subdomain, { fees: false });
  try {
    await signInAsOwner(page);
    await expect(page.getByRole("navigation").first().getByRole("link", { name: "Fees" })).toHaveCount(0);
    await page.goto(url("/app/fees"));
    await expect(page.getByText("Page not found")).toBeVisible();
    await page.goto(url("/app/students"));
    await page.getByRole("row", { name: /Tania Akter/ }).click();
    await expect(page.getByRole("heading", { name: /Tania Akter/, level: 1 })).toBeVisible();
    await expect(page.getByTestId("fee-amounts")).toHaveCount(0);
  } finally {
    await setInstituteModules(INSTITUTE.subdomain, { fees: true });
  }
});
