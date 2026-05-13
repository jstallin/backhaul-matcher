import { defineConfig, devices } from '@playwright/test';

// Set TEST_BASE_URL to run against a specific environment, e.g.:
//   TEST_BASE_URL=https://haulmonitor.cloud/app npx playwright test
// Defaults to local dev server. baseURL is the origin — spec files use the
// appPath helper to navigate to the correct sub-path per environment.
const rawURL = process.env.TEST_BASE_URL || 'http://localhost:5173/app.html';
const BASE_URL = new URL(rawURL).origin;

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['html', { open: 'never' }]],

  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    // Auth setup runs first, once, in Chromium
    {
      name: 'setup',
      testMatch: /auth\.setup\.js/,
    },

    // Desktop browsers
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      dependencies: ['setup'],
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
      dependencies: ['setup'],
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
      dependencies: ['setup'],
    },

    // Mobile viewports
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 5'] },
      dependencies: ['setup'],
    },
    {
      name: 'mobile-safari',
      use: { ...devices['iPhone 13'] },
      dependencies: ['setup'],
    },
  ],

  // Start local dev server when not pointing at a remote URL
  webServer: process.env.TEST_BASE_URL ? undefined : {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
