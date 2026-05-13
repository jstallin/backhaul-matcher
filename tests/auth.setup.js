import { test as setup, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
import { appPath } from './helpers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const STORAGE_STATE = path.join(__dirname, '.auth/user.json');

// Runs once before all browser projects. Logs in with test credentials and
// saves browser storage state so authenticated tests skip the login flow.
//
// Required env vars:
//   TEST_EMAIL    — email of a valid test account
//   TEST_PASSWORD — password for that account

setup('authenticate', async ({ page }) => {
  const email = process.env.TEST_EMAIL;
  const password = process.env.TEST_PASSWORD;

  if (!email || !password) {
    console.log('TEST_EMAIL / TEST_PASSWORD not set — skipping auth setup. Authenticated tests will be skipped.');
    await page.context().storageState({ path: STORAGE_STATE });
    return;
  }

  await page.goto(appPath);
  await expect(page.locator('input[type="email"]')).toBeVisible({ timeout: 15_000 });

  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole('button', { name: 'Sign In' }).click();

  await expect(page.getByText('Haul Monitor')).toBeVisible({ timeout: 15_000 });

  await page.context().storageState({ path: STORAGE_STATE });
});
