import { test, expect } from '@playwright/test';
import { clickAndConfirm } from './confirm.js';

test('cofanie z historii: „kontakt zakończony” klika się w Historii i oferta wraca na listę', async ({
  page,
}) => {
  const client = `Cofanie E2E ${Date.now()}`;
  await page.goto('/oferty/nowa');
  await page.getByLabel('Klient').fill(client);
  await page.getByLabel('Telefon').fill('600 500 600');
  await page.getByLabel('Kto wysłał').selectOption('Bartek');
  await page.getByRole('button', { name: 'Zapisz ofertę' }).click();

  const panel = page.getByRole('region', { name: 'Szczegóły oferty' });
  await panel.getByLabel('Kontakt zakończony').check();
  await clickAndConfirm(page, panel.getByRole('button', { name: 'Rozmowa: Bartek' }));
  await expect(page.getByRole('row', { name: new RegExp(client) })).toHaveCount(0);

  await panel.getByText(/^Historia \(\d+\)$/).click();
  await panel.getByText('Bartek: kontakt zakończony').click();
  await clickAndConfirm(page, panel.getByRole('button', { name: 'Cofnij: Łukasz' }));

  await expect(page.getByRole('row', { name: new RegExp(client) })).toHaveCount(1);
  await expect(panel.getByText('Łukasz: cofnięcie (kontakt zakończony)')).toBeVisible();
});

test('Statystyki: zakładka w menu z klientami i dochodem', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Statystyki' }).click();
  await expect(page.getByRole('heading', { name: 'Statystyki', level: 1 })).toBeVisible();
  await expect(page.getByText('Wszyscy klienci')).toBeVisible();
  await expect(page.getByText('Dochód w tym miesiącu')).toBeVisible();
  await expect(page.getByRole('heading', { name: /Klienci \(\d+\)/ })).toBeVisible();
});
