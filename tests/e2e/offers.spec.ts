import { test, expect } from '@playwright/test';
import { clickAndConfirm } from './confirm.js';

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
  // Cena tylko na rozwiniętej karcie: na liście (monitor widzą goście) kwot nie ma.
  await expect(panel.getByText('3200 zł')).toBeVisible();
  await expect(page.getByRole('row', { name: new RegExp(client) })).not.toContainText('zł');
  await expect(panel.getByRole('link', { name: /Dodaj przypomnienie do Kalendarza Google/ })).toHaveAttribute(
    'href',
    /^https:\/\/calendar\.google\.com\/calendar\/render\?/,
  );

  await panel.getByLabel('Notatka z rozmowy').fill('myśli, oddzwoni w pon.');
  await clickAndConfirm(page, panel.getByRole('button', { name: 'Rozmowa: Bartek' }));
  await panel.getByText(/^Historia \(\d+\)$/).click();
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
