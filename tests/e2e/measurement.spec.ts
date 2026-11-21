import { test, expect } from '@playwright/test';
import { clickAndConfirm } from './confirm.js';

test('data pomiaru później: zlecenie bez daty, tablica prosi o uzupełnienie, data z karty, cofnięcie z historii', async ({
  page,
}) => {
  const client = `Bez daty E2E ${Date.now()}`;
  await page.goto('/zlecenia/nowe');
  await page.getByLabel('Klient').fill(client);
  await page.getByLabel('Telefon').fill('600 700 800');
  await page.getByLabel('Miejscowość').fill('Przykładowo');
  await page.getByLabel('Rodzaj pracy').selectOption({ label: 'Podział nieruchomości' });
  await page.getByLabel('Kto przyjął').selectOption('Łukasz');
  await page.getByRole('button', { name: 'Zapisz zlecenie' }).click();

  const row = page.getByRole('row', { name: new RegExp(client) });
  await expect(row).toContainText('Uzupełnij datę pomiaru');
  const panel = page.getByRole('region', { name: 'Szczegóły zlecenia' });
  await expect(panel.getByText('Brak terminu: uzupełnij datę pomiaru')).toBeVisible();

  await panel.getByLabel('Data pomiaru').fill('2030-01-15');
  await clickAndConfirm(page, panel.getByRole('button', { name: 'Zapisz datę: Bartek' }));
  await expect(panel.getByRole('link', { name: 'Dodaj do Kalendarza Google' })).toBeVisible();
  await expect(row).not.toContainText('Uzupełnij datę pomiaru');

  await panel.getByText(/^Historia \(\d+\)$/).click();
  await panel.getByText('Bartek: data pomiaru (brak → 15.01.2030)').click();
  await clickAndConfirm(page, panel.getByRole('button', { name: 'Cofnij: Łukasz' }));
  await expect(row).toContainText('Uzupełnij datę pomiaru');
  await expect(panel.getByText('Łukasz: cofnięcie (data pomiaru brak → 15.01.2030)')).toBeVisible();
});
