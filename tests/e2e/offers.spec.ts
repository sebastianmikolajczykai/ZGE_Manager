import { test, expect } from '@playwright/test';

test('oferta: dodanie, telefon z notatką, przyjęcie i zlecenie z wypełnionymi danymi', async ({ page }) => {
  const client = `Oferta E2E ${Date.now()}`;
  await page.goto('/');
  await page.getByRole('link', { name: 'Oferty', exact: true }).click();
  await page.getByRole('link', { name: '+ Dodaj ofertę' }).click();

  await page.getByLabel('Klient').fill(client);
  await page.getByLabel('Telefon').fill('600 300 400');
  await page.getByLabel('Rodzaj pracy').selectOption({ label: 'Podział nieruchomości' });
  await page.getByLabel('Miejscowość').fill('Przykładowo');
  await page.getByLabel('Cena w zł').fill('3 200');
  await page.getByLabel('Kto wysłał').selectOption('Marcelina');
  await page.getByRole('button', { name: 'Zapisz ofertę' }).click();

  const panel = page.getByRole('region', { name: 'Szczegóły oferty' });
  await expect(panel.getByRole('heading', { name: client })).toBeVisible();
  await expect(panel.getByText('w terminie')).toBeVisible();
  await expect(page.getByRole('row', { name: new RegExp(client) })).toContainText('3200 zł');

  await panel.getByLabel('Notatka z rozmowy').fill('myśli, oddzwoni w pon.');
  await panel.getByRole('button', { name: 'Rozmowa: Bartek' }).click();
  await expect(panel.getByText('Bartek: telefon (myśli, oddzwoni w pon.)')).toBeVisible();

  await panel.getByRole('link', { name: 'Przyjęta → zrób zlecenie' }).click();
  await expect(page.getByLabel('Klient')).toHaveValue(client);
  await expect(page.getByLabel('Cena w zł')).toHaveValue('3200');
  await page.getByLabel('Data pomiaru').fill('2030-01-15');
  await page.getByLabel('Kto przyjął').selectOption('Łukasz');
  await page.getByRole('button', { name: 'Zapisz zlecenie' }).click();

  await expect(
    page.getByRole('region', { name: 'Szczegóły zlecenia' }).getByRole('heading', { name: client }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Oferty', exact: true }).click();
  await expect(page.getByRole('row', { name: new RegExp(client) })).toHaveCount(0);
});
