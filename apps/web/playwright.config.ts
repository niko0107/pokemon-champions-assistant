import { defineConfig, devices } from "@playwright/test";

const apiHealthUrl = "http://localhost:3000/api/v1/health";
const webUrl = "http://localhost:5173";

/**
 * 最低限の起動確認 E2E。
 * webServer で API(:3000)と Web(:5173)を起動してからテストする。
 * DB / Redis は不要(health エンドポイントは DB に依存しない)。
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: webUrl,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: [
    {
      name: "API",
      command: "pnpm dev",
      cwd: "../api",
      url: apiHealthUrl,
      reuseExistingServer: !process.env.CI,
      stdout: "pipe",
      stderr: "pipe",
      timeout: 120_000,
    },
    {
      name: "Web",
      command: "pnpm dev --host localhost --port 5173 --strictPort",
      url: webUrl,
      reuseExistingServer: !process.env.CI,
      stdout: "pipe",
      stderr: "pipe",
      timeout: 120_000,
    },
  ],
});
