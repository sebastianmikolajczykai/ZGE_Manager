import { test, expect } from '@playwright/test';
import { clickAndConfirm } from './confirm.js';

test('numer zlecenia: na tablicy zamiast klienta, bez ceny; klient i cena po rozwinięciu; zmiana numeru z karty', async ({
  page,
}) => {
  const stamp = Date.now();
  const number = `125 podział ${stamp}`;
  const client = `Klient numer E2E ${stamp}`;

  await page.goto('/zlecenia/nowe');
  await page.getByLabel('Nr zlecenia').fill(number);
  await page.getByLabel('Klient').fill(client);
  await page.getByLabel('Telefon').fill('600 700 800');
  await page.getByLabel('Miejscowość').fill('Przykładowo');
  await page.getByLabel('Cena w zł').fill('2 700');
  await page.getByLabel('Kto przyjął').selectOption('Łukasz');
  await page.getByRole('button', { name: 'Zapisz zlecenie' }).click();

  const row = page.getByRole('row', { name: new RegExp(number) });
  await expect(row).toBeVisible();
  await expect(row.getByRole('link')).toHaveText(number);
  await expect(row.getByText(client)).toBeHidden();
  await expect(row).not.toContainText('zł');
  // Wyszukiwarka znajduje zlecenie także po kliencie, choć na liście widać numer.
  await page.getByRole('searchbox', { name: 'Szukaj' }).fill(client);
  await expect(row).toBeVisible();

  const card = page.getByRole('region', { name: 'Szczegóły zlecenia' });
  await expect(card.getByRole('heading', { name: number })).toBeVisible();
  await expect(card.getByText(client)).toBeVisible();
  await expect(card.getByText('2700 zł')).toBeVisible();

  await card.getByText('Zmień numer zlecenia').click();
  await card.getByLabel('Numer zlecenia').fill(`126 syt wys ${stamp}`);
  await clickAndConfirm(page, card.getByRole('button', { name: 'Zapisz numer: Bartek' }));
  await expect(card.getByRole('heading', { name: `126 syt wys ${stamp}` })).toBeVisible();
  await card.getByText(/^Historia \(\d+\)$/).click();
  await expect(card.getByText(`Bartek: numer zlecenia (${number} → 126 syt wys ${stamp})`)).toBeVisible();

  await page.goto('/monitor');
  await expect(page.getByText(`126 syt wys ${stamp}`)).toBeVisible();
  await expect(page.getByText(client)).toHaveCount(0);
});
