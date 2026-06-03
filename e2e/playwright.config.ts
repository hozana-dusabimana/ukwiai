import { defineConfig, devices } from "@playwright/test";

// UI tests run against the deployed frontend by default. Override with
// PLAYWRIGHT_BASE_URL to point at a local/staging instance.
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || "https://ukwiai.isiri.rw";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
});
