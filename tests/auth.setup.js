import { test as setup, expect } from '@playwright/test';
import { appPath, STORAGE_STATE } from './helpers.js';
import fs from 'fs';
import path from 'path';

export { STORAGE_STATE };

setup('authenticate', async ({ page }) => {
  const email = process.env.TEST_EMAIL;
  const password = process.env.TEST_PASSWORD;

  if (!email || !password) {
    console.log('TEST_EMAIL / TEST_PASSWORD not set — skipping auth setup.');
    // Write empty storage state so dependent tests can load it without errors
    fs.mkdirSync(path.dirname(STORAGE_STATE), { recursive: true });
    fs.writeFileSync(STORAGE_STATE, JSON.stringify({ cookies: [], origins: [] }));
    setup.skip();
    return;
  }

  await page.goto(appPath);
  await expect(page.locator('input[type="email"]')).toBeVisible({ timeout: 15_000 });

  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole('button', { name: 'Sign In' }).click();

  // .first() — the brand appears more than once on the shell; strict mode would
  // otherwise fail (intermittently, browser-dependent) on "resolved to N elements".
  await expect(page.getByText('Haul Monitor').first()).toBeVisible({ timeout: 15_000 });

  fs.mkdirSync(path.dirname(STORAGE_STATE), { recursive: true });
  await page.context().storageState({ path: STORAGE_STATE });
});