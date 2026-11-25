import { test, expect, type Page } from '@playwright/test';
import { clickAndConfirm } from './confirm.js';

async function addOrder(page: Page, client: string, lead: string): Promise<void> {
  await page.goto('/zlecenia/nowe');
  await page.getByLabel('Klient').fill(client);
  await page.getByLabel('Telefon').fill('600 100 200');
  await page.getByLabel('Miejscowość').fill('Przykładowo');
  await page.getByLabel('Rodzaj pracy').selectOption({ label: 'Podział nieruchomości' });
  await page.getByLabel('Data pomiaru').fill('2030-01-15');
  await page.getByLabel('Prowadzi zlecenie').selectOption(lead);
  await page.getByLabel('Kto przyjął').selectOption('Łukasz');
  await page.getByRole('button', { name: 'Zapisz zlecenie' }).click();
}

test('filtr „Moje”: osoba prowadząca, przypisanie kroku i zapamiętanie osoby na komputerze', async ({
  page,
}) => {
  const client = `Moje E2E ${Date.now()}`;
  await addOrder(page, client, 'Marcelina');
  const row = page.getByRole('row', { name: new RegExp(client) });

  await page.goto('/');
  await page.getByLabel('Pokaż zlecenia osoby').selectOption('Marcelina');
  await expect(page).toHaveURL(/\?osoba=Marcelina$/);
  await expect(row).toBeVisible();
  await page.getByLabel('Pokaż zlecenia osoby').selectOption('Bartek');
  await expect(row).toBeHidden();

  // Przeglądarka pamięta ostatnio wybraną osobę: przycisk „Moje” wraca do jej zleceń.
  await page.goto('/');
  await page.getByRole('link', { name: '👤 Moje (Bartek)' }).click();
  await expect(page).toHaveURL(/\?osoba=Bartek$/);

  // Na karcie: oba bieżące kroki (1 i 2 trwają równolegle) robi Bartek, więc zlecenie przechodzi do jego „Moje”.
  await page.goto('/');
  await row.getByRole('link', { name: client }).click();
  const panel = page.getByRole('region', { name: 'Szczegóły zlecenia' });
  await panel.getByText('Osoby w zleceniu').click();
  await panel.getByLabel('Osoba do kroku 1', { exact: true }).selectOption('Bartek');
  await panel.getByLabel('Osoba do kroku 2', { exact: true }).selectOption('Bartek');
  await clickAndConfirm(page, panel.getByRole('button', { name: 'Zapisz osoby: Łukasz' }));
  await panel.getByText(/^Historia \(\d+\)$/).click();
  await expect(
    panel.getByText('Łukasz: osoba do kroku „Ustalenie terminu pomiaru w terenie” (brak → Bartek)'),
  ).toBeVisible();

  await page.goto('/?osoba=Bartek');
  await expect(row).toBeVisible();
  await page.goto('/?osoba=Marcelina');
  await expect(row).toBeHidden();
});

test('widok na monitor: duże kafle, zegar, link z menu', async ({ page, context }) => {
  const client = `Monitor E2E ${Date.now()}`;
  await addOrder(page, client, 'Bartek');
  await page.goto('/');
  const [monitor] = await Promise.all([
    context.waitForEvent('page'),
    page.getByRole('link', { name: 'Widok na monitor' }).click(),
  ]);
  await expect(monitor).toHaveURL(/\/monitor$/);
  const tile = monitor.locator('article', { hasText: client });
  await expect(tile).toBeVisible();
  await expect(tile).toContainText('Ustalenie terminu pomiaru w terenie');
  await expect(tile).toContainText('Bartek');
  await expect(monitor.locator('#zegar')).toHaveText(/^\d{2}:\d{2}$/);
});

test('przyciski − / + zmieniają liczbę w Ustawieniach (w granicach), zapis jak zwykle', async ({ page }) => {
  await page.goto('/ustawienia#kolory');
  const field = page.getByRole('spinbutton', { name: 'Przypomnienie o ofercie po' });
  const before = Number(await field.inputValue());
  await page.getByRole('button', { name: 'Zwiększ: Przypomnienie o ofercie po' }).click();
  await expect(field).toHaveValue(String(before + 1));
  await page.getByRole('button', { name: 'Zapisz zmiany: Bartek' }).click();
  await expect(field).toHaveValue(String(before + 1));

  await page.getByRole('button', { name: 'Zmniejsz: Przypomnienie o ofercie po' }).click();
  await page.getByRole('button', { name: 'Zapisz zmiany: Bartek' }).click();
  await expect(field).toHaveValue(String(before));

  // Dolna granica: „Żółte przed limitem kroku” nie spadnie poniżej minimum pola.
  const warn = page.getByRole('spinbutton', { name: 'Żółte przed limitem kroku' });
  const min = (await warn.getAttribute('min')) ?? '0';
  for (let i = 0; i < 5; i++)
    await page.getByRole('button', { name: 'Zmniejsz: Żółte przed limitem kroku' }).click();
  await expect(warn).toHaveValue(min);
});
