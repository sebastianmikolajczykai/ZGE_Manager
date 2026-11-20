import { test, expect } from '@playwright/test';

test('ustawienia: zmiana progu, historia zmian i przywrócenie domyślnych', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Ustawienia' }).click();
  await expect(page.getByRole('heading', { name: 'Kolory i przypomnienia' })).toBeVisible();

  await page.getByRole('spinbutton', { name: 'Przypomnienie o ofercie po' }).fill('9');
  await page.getByRole('button', { name: 'Zapisz: Bartek' }).click();
  await expect(page.getByRole('spinbutton', { name: 'Przypomnienie o ofercie po' })).toHaveValue('9');

  await page.getByText(/^Historia zmian ustawień \(\d+\)$/).click();
  await expect(page.getByText('Bartek: „Przypomnienie o ofercie po” 7 → 9')).toBeVisible();

  await page.getByText('Przywróć domyślne', { exact: false }).first().click();
  await page.getByRole('button', { name: 'Przywróć domyślne: Łukasz' }).click();
  await expect(page.getByRole('spinbutton', { name: 'Przypomnienie o ofercie po' })).toHaveValue('7');
  await expect(page.getByText('Łukasz: „Przypomnienie o ofercie po” 9 → 7')).toBeVisible();
});
