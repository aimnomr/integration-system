import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for the AMR Console frontend E2E suite.
 *
 * Assumes the full backend stack is up (start-all.ps1) — these tests hit a
 * real FastAPI + Mosquitto + Postgres on localhost. They do NOT mock; the
 * point of the suite is to verify the frontend wiring against live services.
 *
 * The Vite dev server is started automatically (`webServer` below) so a
 * single `npx playwright test` covers the whole loop.
 */
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: false,           // many tests share the same backend state
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,                     // serialised — admin CRUD touches shared DB
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],

  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],

  webServer: process.env.E2E_NO_WEBSERVER ? undefined : {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
