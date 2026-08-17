import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end suite.
 *
 * These tests talk to real Google Sheets and real Redis — there is no mock
 * layer, because the things most worth testing here (the write-behind queue,
 * the session lifecycle, cache busting) only exist in the interaction with
 * those services. Point BASE_URL at a preview deployment or a local dev server
 * with a throwaway spreadsheet.
 */
const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:3000';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
    // Guest flows are phone flows. Testing them at desktop width would miss
    // the sticky bottom nav and the bottom-sheet dialogs entirely.
    ...devices['iPhone 13'],
  },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: 'npm run dev',
        url: 'http://localhost:3000',
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
