import { test, expect } from '@playwright/test';

test('app serves the start page in Polish', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/ZGE/);
  await expect(page.locator('html')).toHaveAttribute('lang', 'pl');
});
