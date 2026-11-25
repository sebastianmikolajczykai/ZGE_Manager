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

test('tryb ciemny: przyciski „Jasny” / „Ciemny” w Ustawieniach działają razem z przełącznikiem w menu', async ({
  page,
}) => {
  await page.goto('/ustawienia');
  const looks = page.getByRole('group', { name: 'Wygląd ekranu' });
  const light = looks.getByRole('button', { name: 'Jasny' });
  const dark = looks.getByRole('button', { name: 'Ciemny' });
  const sideToggle = page.locator('#motyw');
  await expect(light).toHaveAttribute('aria-pressed', 'true');

  await dark.click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(dark).toHaveAttribute('aria-pressed', 'true');
  await expect(light).toHaveAttribute('aria-pressed', 'false');
  await expect(sideToggle).toHaveAttribute('aria-pressed', 'true');
  await dark.click(); // drugi klik w „Ciemny” nic nie przełącza
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

  await page.reload();
  await expect(dark).toHaveAttribute('aria-pressed', 'true');

  // Przełącznik w menu bocznym zmienia też przyciski w Ustawieniach.
  await sideToggle.click();
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', 'dark');
  await expect(light).toHaveAttribute('aria-pressed', 'true');
  await dark.click();
  await light.click();
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', 'dark');
  await expect(sideToggle).toHaveAttribute('aria-pressed', 'false');
});
