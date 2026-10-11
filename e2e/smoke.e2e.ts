import { expect, test } from "@playwright/test";
import { E2E_INSTITUTE } from "./global-setup";
import { instituteUrl, platformUrl, siteUrl } from "./helpers";

test("the root domain serves the product site", async ({ page }) => {
  await page.goto(siteUrl("/"));
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test("an institute's subdomain serves its public page at / (D19)", async ({ page }) => {
  await page.goto(instituteUrl(E2E_INSTITUTE.subdomain, "/"));
  await expect(page.getByRole("heading", { level: 1, name: E2E_INSTITUTE.name })).toBeVisible();
});

test("an unknown subdomain shows the generic not-found page", async ({ page }) => {
  await page.goto(instituteUrl("no-such-institute", "/"));
  await expect(page.getByRole("heading", { level: 1, name: "Institute not found" })).toBeVisible();
});

test("the admin host serves the platform app, and neither host serves the other's internal routes", async ({ page }) => {
  await page.goto(platformUrl("/"));
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Platform");
  // Through the browser: only browsers resolve *.localhost without a hosts-file entry.
  expect((await page.goto(platformUrl("/institute")))?.status()).toBe(404);
  expect((await page.goto(instituteUrl(E2E_INSTITUTE.subdomain, "/platform")))?.status()).toBe(404);
});
