import { test, expect } from '@playwright/test';
import { appPath } from './helpers.js';

// Unauthenticated tests — no credentials required.
// These verify the login page renders and is interactive across all browsers.

test.describe('Login page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(appPath);
    // Wait for the auth check to settle (spinner disappears, form appears)
    await expect(page.locator('input[type="email"]')).toBeVisible({ timeout: 15_000 });
  });

  test('renders email and password fields', async ({ page }) => {
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign In' })).toBeVisible();
  });

  test('shows Sign Up link', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Sign Up' })).toBeVisible();
  });

  test('forgot password flow shows reset form', async ({ page }) => {
    await page.getByRole('button', { name: 'Forgot Password?' }).click();
    await expect(page.getByRole('button', { name: 'Send Reset Link' })).toBeVisible();
    await expect(page.locator('input[type="password"]')).not.toBeVisible();
  });

  test('back to sign in from forgot password', async ({ page }) => {
    await page.getByRole('button', { name: 'Forgot Password?' }).click();
    await page.getByRole('button', { name: 'Back to Sign In' }).click();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign In' })).toBeVisible();
  });

  test('shows Sign Up form when toggled', async ({ page }) => {
    await page.getByRole('button', { name: 'Sign Up' }).click();
    await expect(page.getByText('Already have an account')).toBeVisible();
  });

  test('inputs are required', async ({ page }) => {
    await expect(page.locator('input[type="email"]')).toHaveAttribute('required');
    await expect(page.locator('input[type="password"]')).toHaveAttribute('required');
  });

  test('shows error for bad credentials', async ({ page }) => {
    await page.locator('input[type="email"]').fill('bad@example.com');
    await page.locator('input[type="password"]').fill('wrongpassword');
    await page.getByRole('button', { name: 'Sign In' }).click();
    await expect(page.locator('text=/invalid|incorrect|failed|wrong/i')).toBeVisible({ timeout: 10_000 });
  });
});
