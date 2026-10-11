import { defineConfig, devices } from "@playwright/test";
import { config as loadEnv } from "dotenv";

/**
 * Runs its own dev server on port 3100, with its own build directory, against the test database.
 * Don't run alongside `npm test`: both reset the test database.
 */
const PORT = 3100;
const serverEnv: Record<string, string> = { ...loadEnv({ path: ".env.test", quiet: true }).parsed };
delete serverEnv.NODE_ENV; // `next dev` sets NODE_ENV itself

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.e2e.ts",
  fullyParallel: false,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  globalSetup: "./e2e/global-setup.ts",
  expect: { timeout: 15_000 },
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npx next dev --port ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      ...serverEnv,
      NEXT_DIST_DIR: ".next/e2e",
      APP_BASE_DOMAIN: `localhost:${PORT}`,
      PLATFORM_HOST: `admin.localhost:${PORT}`,
    },
  },
});
