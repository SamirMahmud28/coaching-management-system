import { expect, test } from "@playwright/test";

test("the app starts and serves the home page", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});
