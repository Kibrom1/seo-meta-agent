import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  retries: 0,
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  use: {
    baseURL: "http://localhost:3000",
    // Don't follow redirects automatically in API tests so we can assert status codes
    extraHTTPHeaders: {
      "Content-Type": "application/json",
    },
  },
  projects: [
    {
      name: "api",
      testMatch: "**/api/**/*.spec.ts",
    },
    {
      name: "ui",
      testMatch: "**/ui/**/*.spec.ts",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "pipeline",
      testMatch: "**/pipeline/**/*.spec.ts",
    },
  ],
});
