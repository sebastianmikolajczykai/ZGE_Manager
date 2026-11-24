import { test, expect } from '@playwright/test';
import { clickAndConfirm } from './confirm.js';

test('niezapłacone: po oddaniu klientowi zlecenie przechodzi do zakładki, SMS do skopiowania, rozmowa, zapłacone', async ({
  page,
  context,
}) => {
  const client = `Zapłata E2E ${Date.now()}`;
  await page.goto('/ustawienia');
  await page.getByLabel('Numer konta').fill('66105014451000009030216767');
  await page.getByRole('button', { name: 'Zapisz dane SMS: Łukasz' }).click();
  await expect(page.getByLabel('Numer konta')).toHaveValue('66 1050 1445 1000 0090 3021 6767');

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
    await clickAndConfirm(
      page,
      card.getByRole('button', { name: /^(Zrobione|Zakończone): Łukasz$/ }).first(),
    );
    await expect(card.getByRole('heading', { name: client })).toBeVisible();
  }
  await expect(page.getByRole('row', { name: new RegExp(client) })).toHaveCount(0);

  await page.getByRole('link', { name: 'Niezapłacone', exact: true }).click();
  await page.getByRole('link', { name: client }).click();
  const panel = page.getByRole('region', { name: 'Szczegóły zapłaty' });
  await expect(panel.getByText('2900 zł')).toBeVisible();

  const sms = panel.getByLabel('Treść wiadomości');
  await expect(sms).toHaveValue(/kwota do zapłaty to 2 900,00 zł.*konto: 66 1050 1445 1000 0090 3021 6767\./);
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await panel.getByRole('button', { name: '📋 Kopiuj wiadomość' }).click();
  await expect(panel.getByRole('button', { name: '✓ Skopiowano' })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(await sms.inputValue());

  await panel.getByLabel('Notatka z rozmowy').fill('zapłaci w piątek');
  await clickAndConfirm(page, panel.getByRole('button', { name: 'Rozmowa: Marcelina' }));
  await panel.getByText(/^Historia \(\d+\)$/).click();
  await expect(panel.getByText('Marcelina: przypomnienie o zapłacie (zapłaci w piątek)')).toBeVisible();

  await clickAndConfirm(page, panel.getByRole('button', { name: 'Zapłacone: Bartek' }));
  await expect(page.getByRole('row', { name: new RegExp(client) })).toHaveCount(0);
});
