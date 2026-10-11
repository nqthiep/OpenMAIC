import { defineConfig, devices } from '@playwright/test';

// Specs seed their courses into the app's database, so e2e needs a database of its own. Locally it is
// named by E2E_DATABASE_URL. CI sets no such variable and uses its disposable service database
// (DATABASE_URL). The dev database in .env.local is never the target.
const e2eDatabaseUrl =
  process.env.E2E_DATABASE_URL ?? (process.env.CI ? process.env.DATABASE_URL : undefined);
if (!e2eDatabaseUrl) {
  throw new Error('Set E2E_DATABASE_URL to a database used only by e2e, not the dev database.');
}

// Walkthrough specs pass without retries (docs/tutor/TEST-STRATEGY.md §9): a retry would hide a flaky frame.
const walkthroughSpecs = /walkthrough-[^/\\]*\.spec\.ts$/;

export default defineConfig({
  testDir: './e2e/tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // CI builds the production bundle in a dedicated workflow step, so this
  // process only drives Chromium. Two workers fit a 4-core runner.
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? 'html' : 'list',
  use: {
    baseURL: 'http://localhost:3002',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      testIgnore: walkthroughSpecs,
    },
    {
      name: 'chromium-walkthrough',
      use: { ...devices['Desktop Chrome'] },
      testMatch: walkthroughSpecs,
      retries: 0,
    },
  ],
  webServer: {
    // In CI the production build runs as a dedicated workflow step before
    // Playwright, so this only boots the already-built server (`pnpm start`).
    // The 120s budget covers startup, not the (much slower) build. Locally we
    // run the dev server.
    //
    // The server refuses to start without DATABASE_URL (courses are stored in
    // PostgreSQL). This run hands it e2eDatabaseUrl. Locally, point
    // E2E_DATABASE_URL at a second database on the server started by `pnpm db:up`
    // (for example openmaic_e2e). Specs seed their courses through the app's
    // persistence endpoint (e2e/fixtures/server-seed.ts), each under a fresh id.
    command: process.env.CI ? 'pnpm start' : 'pnpm dev',
    url: 'http://localhost:3002',
    // A reused server may be bound to another database.
    reuseExistingServer: false,
    timeout: 120_000,
    // Enable the MAIC Editor (Pro mode) so editor e2e can reach it. This is a
    // build-time NEXT_PUBLIC_* flag: in CI it must be set on the dedicated
    // `pnpm build` step; locally `pnpm dev` reads it here.
    env: {
      PORT: '3002',
      DATABASE_URL: e2eDatabaseUrl,
      NEXT_PUBLIC_MAIC_EDITOR_ENABLED: 'true',
      // Leave Pi chat unset so the browser suite exercises the shipped default.
      NEXT_PUBLIC_COURSEWARE_REFERENCE_ENABLED: 'true',
    },
  },
});
