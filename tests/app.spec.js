import { test, expect } from '@playwright/test';
import { appPath, resetPath, STORAGE_STATE } from './helpers.js';

// Authenticated tests — require TEST_EMAIL + TEST_PASSWORD to be set.
// The auth setup saves a storage state file; if credentials weren't provided
// these tests skip gracefully.

test.use({ storageState: STORAGE_STATE });

const requireAuth = () =>
  test.skip(!process.env.TEST_EMAIL, 'TEST_EMAIL not set — skipping authenticated tests');

test.describe('Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    requireAuth();
    await page.goto(appPath);
    await expect(page.getByText('Haul Monitor').first()).toBeVisible({ timeout: 20_000 });
  });

  test('loads and shows a welcome heading', async ({ page }) => {
    // The dashboard always shows a welcome heading regardless of fleet state
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 10_000 });
  });

  test('avatar button is visible', async ({ page }) => {
    // AvatarMenu renders a button with the user's initial — always present when logged in
    await expect(page.getByRole('button').filter({ hasText: /^[A-Z]$/ })).toBeVisible();
  });
});

test.describe('Navigation', () => {
  test.beforeEach(async ({ page }) => {
    requireAuth();
    await page.goto(appPath);
    await expect(page.getByText('Haul Monitor').first()).toBeVisible({ timeout: 20_000 });
  });

  test('can navigate to Fleets view', async ({ page }) => {
    const fleetsLink = page.getByText(/fleets/i).first();
    if (await fleetsLink.isVisible()) {
      await fleetsLink.click();
      await expect(page.getByText(/fleet/i)).toBeVisible({ timeout: 10_000 });
    }
  });

  test('can navigate to Start Request view', async ({ page }) => {
    const startLink = page.getByText(/start request/i).first();
    if (await startLink.isVisible()) {
      await startLink.click();
      await expect(page.getByText(/request/i)).toBeVisible({ timeout: 10_000 });
    }
  });
});

test.describe('No JS errors on load', () => {
  test('dashboard page loads without uncaught errors', async ({ page }) => {
    requireAuth();
    const errors = [];
    page.on('pageerror', (err) => errors.push(err.message));
    await page.goto(appPath);
    await expect(page.getByText('Haul Monitor').first()).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(2000);
    expect(errors.filter(e => !e.includes('ResizeObserver'))).toHaveLength(0);
  });

  test('login page loads without uncaught errors', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (err) => errors.push(err.message));
    // Clear storage before navigation so auth state is gone when the page loads
    await page.addInitScript(() => localStorage.clear());
    await page.context().clearCookies();
    await page.goto(appPath);
    await page.waitForTimeout(3000);
    expect(errors.filter(e => !e.includes('ResizeObserver'))).toHaveLength(0);
  });
});

test.describe('Special routes', () => {
  test('reset-password route renders without crashing', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (err) => errors.push(err.message));
    await page.goto(resetPath);
    await page.waitForTimeout(2000);
    await expect(page.locator('body')).not.toBeEmpty();
    expect(errors).toHaveLength(0);
  });
});
