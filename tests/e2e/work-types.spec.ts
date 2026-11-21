import { test, expect } from '@playwright/test';

test('rodzaje prac: nowy rodzaj z krokami, kolejność, zapis i wybór przy zleceniu', async ({ page }) => {
  const name = `Mapa E2E ${Date.now()}`;
  await page.goto('/ustawienia#rodzaje-prac');
  await page.getByRole('link', { name: '+ Nowy rodzaj pracy' }).click();

  await page.getByLabel('Nazwa rodzaju pracy').fill(name);
  await page.getByLabel('Nazwa kroku 1').fill('Zapłata');
  await page.getByRole('button', { name: '+ Dodaj krok' }).click();
  await expect(page.getByRole('status')).toContainText('nie są jeszcze zapisane');
  await page.getByLabel('Nazwa kroku 2').fill('Pomiar');

  // Enter w polu tekstowym nie może przestawiać kroków ani zapisywać.
  await page.getByLabel('Nazwa kroku 2').press('Enter');
  await expect(page.getByLabel('Nazwa kroku 1')).toHaveValue('Zapłata');

  await page.getByRole('button', { name: 'Krok 2 w górę' }).click();
  await expect(page.getByLabel('Nazwa kroku 1')).toHaveValue('Pomiar');
  await page.getByLabel('Rodzaj kroku 2').selectOption({ label: 'Czekamy (urząd / klient)' });
  await page.getByLabel('Limit kroku 2 (dni roboczych)', { exact: true }).fill('14');
  await page.getByLabel('Krok 2 to zapłata').check();
  await page.getByRole('button', { name: 'Zapisz: Łukasz' }).click();
  await expect(page.getByRole('status')).toContainText('Zapisano');

  await page.getByRole('link', { name: '+ Dodaj zlecenie' }).click();
  await expect(page.getByLabel('Rodzaj pracy').locator('option', { hasText: name })).toHaveCount(1);
});
