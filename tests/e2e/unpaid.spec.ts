import { test, expect } from '@playwright/test';

test('niezapłacone: po oddaniu klientowi zlecenie przechodzi do zakładki, rozmowa, zapłacone', async ({
  page,
}) => {
  const client = `Zapłata E2E ${Date.now()}`;
  await page.goto('/zlecenia/nowe');
  await page.getByLabel('Klient').fill(client);
  await page.getByLabel('Telefon').fill('600 500 600');
  await page.getByLabel('Miejscowość').fill('Przykładowo');
  await page.getByLabel('Data pomiaru').fill('2030-01-15');
  await page.getByLabel('Cena w zł').fill('2 900');
  await page.getByLabel('Kto przyjął').selectOption('Łukasz');
  await page.getByRole('button', { name: 'Zapisz zlecenie' }).click();

  const card = page.getByRole('region', { name: 'Szczegóły zlecenia' });
  for (let step = 1; step <= 12; step++) {
    await card.getByRole('button', { name: /^(Zrobione|Zakończone): Łukasz$/ }).click();
    await expect(card.getByRole('heading', { name: client })).toBeVisible();
  }
  await expect(page.getByRole('row', { name: new RegExp(client) })).toHaveCount(0);

  await page.getByRole('link', { name: 'Niezapłacone', exact: true }).click();
  await page.getByRole('link', { name: client }).click();
  const panel = page.getByRole('region', { name: 'Szczegóły zapłaty' });
  await expect(panel.getByText('2900 zł')).toBeVisible();

  await panel.getByLabel('Notatka z rozmowy').fill('zapłaci w piątek');
  await panel.getByRole('button', { name: 'Rozmowa: Marcelina' }).click();
  await expect(panel.getByText('Marcelina: przypomnienie o zapłacie (zapłaci w piątek)')).toBeVisible();

  await panel.getByRole('button', { name: 'Zapłacone: Bartek' }).click();
  await expect(page.getByRole('row', { name: new RegExp(client) })).toHaveCount(0);
});
