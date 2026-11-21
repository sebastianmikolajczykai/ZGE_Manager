import { test, expect, type Page } from '@playwright/test';

const backgroundOf = (page: Page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor);

test('tryb ciemny: przełącznik w menu, zapamiętany na komputerze, wyłączany tym samym przyciskiem', async ({
  page,
}) => {
  await page.goto('/');
  const toggle = page.getByRole('button', { name: 'Tryb ciemny' });
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  const lightBackground = await backgroundOf(page);

  await toggle.click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  expect(await backgroundOf(page)).not.toBe(lightBackground);

  // Po odświeżeniu i na innym ekranie tryb zostaje.
  await page.goto('/ustawienia');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.getByRole('button', { name: 'Tryb ciemny' })).toHaveAttribute('aria-pressed', 'true');

  await page.getByRole('button', { name: 'Tryb ciemny' }).click();
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', 'dark');
  expect(await backgroundOf(page)).toBe(lightBackground);
});
