import { test, expect } from '@playwright/test';

test('ustawienia: zmiana progu, historia zmian i przywrócenie domyślnych', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Ustawienia' }).click();
  await expect(page.getByRole('heading', { name: 'Kolory i przypomnienia' })).toBeVisible();
  await page.getByRole('link', { name: '🎨 Kolory i przypomnienia' }).click();

  await page.getByRole('spinbutton', { name: 'Przypomnienie o ofercie po' }).fill('9');
  await page.getByRole('button', { name: 'Zapisz zmiany: Bartek' }).click();
  await expect(page.getByRole('spinbutton', { name: 'Przypomnienie o ofercie po' })).toHaveValue('9');

  await page.getByText(/^Historia zmian ustawień \(\d+\)$/).click();
  await expect(page.getByText('Bartek: „Przypomnienie o ofercie po” 7 → 9')).toBeVisible();

  await page.getByText('Przywróć domyślne', { exact: false }).first().click();
  await page.getByRole('button', { name: 'Przywróć domyślne: Łukasz' }).click();
  await expect(page.getByRole('spinbutton', { name: 'Przypomnienie o ofercie po' })).toHaveValue('7');
  await expect(page.getByText('Łukasz: „Przypomnienie o ofercie po” 9 → 7')).toBeVisible();
});

test('ustawienia: niezapisane zmiany widać, błędy są przy polach, po zapisie jest potwierdzenie', async ({
  page,
}) => {
  await page.goto('/ustawienia#kolory');
  const yellow = page.getByRole('spinbutton', { name: 'Żółte, gdy brak ruchu przez' });
  const red = page.getByRole('spinbutton', { name: 'Czerwone, gdy brak ruchu przez' });
  const refresh = page.getByRole('spinbutton', { name: 'Odświeżanie ekranu co (sekund)' });
  const unsaved = page.locator('.dirty-note');
  await expect(unsaved).toBeHidden();

  // Czerwone wcześniej niż żółte + puste pole: nic się nie zapisuje, komunikaty przy polach.
  await yellow.fill('5');
  await red.fill('4');
  await refresh.fill(''); // pole liczbowe w przeglądarce nie przyjmie liter; puste też jest błędem
  await expect(unsaved).toHaveText('Niezapisane zmiany: 3');
  await page.getByRole('button', { name: 'Zapisz zmiany: Marcelina' }).click();
  await expect(page.getByRole('alert')).toHaveText('Nie zapisano. Popraw zaznaczone pola (2).');
  await expect(red).toHaveAccessibleDescription(
    /Czerwone musi przyjść później niż żółte: wpisz co najmniej 6\./,
  );
  await expect(refresh).toHaveAccessibleDescription(/Wpisz liczbę całkowitą od 15 do 600\./);
  await expect(yellow).toHaveValue('5');

  // Poprawka i zapis: zielone potwierdzenie z liczbą zmian i osobą.
  await red.fill('6');
  await refresh.fill('60');
  await page.getByRole('button', { name: 'Zapisz zmiany: Marcelina' }).click();
  await expect(page.getByRole('status')).toHaveText('✓ Zapisano 2 zmiany (Marcelina). Działają od razu.');
  await expect(red).toHaveValue('6');
  await expect(unsaved).toBeHidden();

  // Uwaga (bez blokady), gdy „Żółte przed limitem” sięga limitu kroku.
  await page.getByRole('spinbutton', { name: 'Żółte przed limitem kroku' }).fill('2');
  await page.getByRole('button', { name: 'Zapisz zmiany: Marcelina' }).click();
  await expect(page.getByRole('status')).toContainText('Zapisano 1 zmianę');
  await expect(page.locator('.field-notice')).toContainText('będą żółte już od pierwszego dnia');

  // Sprzątanie dla kolejnych testów.
  await page.getByText('Przywróć domyślne', { exact: false }).first().click();
  await page.getByRole('button', { name: 'Przywróć domyślne: Marcelina' }).click();
  await expect(red).toHaveValue('3');
});

test('ustawienia: wyjście ze strony z niezapisanymi zmianami pyta, czy je porzucić', async ({ page }) => {
  await page.goto('/ustawienia#kolory');
  await page.getByRole('button', { name: 'Zwiększ: Przypomnienie o ofercie po' }).click();
  const asked = new Promise<string>((resolve) => {
    page.once('dialog', (dialog) => {
      resolve(dialog.type());
      void dialog.accept();
    });
  });
  await page.getByRole('link', { name: 'Oferty' }).first().click();
  expect(await asked).toBe('beforeunload');
  await expect(page).toHaveURL(/\/oferty/);
});

test('ustawienia: sekcje są zwinięte, menu u góry je rozwija, przeglądarka pamięta wybór', async ({
  page,
}) => {
  await page.goto('/ustawienia');
  const offerField = page.getByRole('spinbutton', { name: 'Przypomnienie o ofercie po' });
  const addDayOff = page.getByRole('button', { name: 'Dodaj dni wolne: Łukasz' });
  await expect(page.getByRole('heading', { name: /^Dni wolne firmy/ })).toBeVisible();
  await expect(offerField).toBeHidden();
  await expect(addDayOff).toBeHidden();

  // Klik w menu u góry rozwija wybraną sekcję; historia w środku zostaje zwinięta.
  await page.getByRole('link', { name: '🏖 Dni wolne' }).click();
  await expect(addDayOff).toBeVisible();
  await expect(offerField).toBeHidden();
  await page.getByRole('heading', { name: 'Kolory i przypomnienia' }).click();
  await expect(offerField).toBeVisible();
  await expect(page.getByText(/^Historia zmian ustawień \(\d+\)$/)).toBeVisible();
  await expect(page.locator('details[data-fold="settings-history"]')).not.toHaveAttribute('open', '');

  // Po odświeżeniu rozwinięte zostają rozwinięte; ponowny klik w tytuł zwija sekcję.
  await page.reload();
  await expect(offerField).toBeVisible();
  await expect(addDayOff).toBeVisible();
  await page.getByRole('heading', { name: /^Dni wolne firmy/ }).click();
  await expect(addDayOff).toBeHidden();
  await page.getByRole('heading', { name: 'Kolory i przypomnienia' }).click();
  await expect(offerField).toBeHidden();
});

test('ustawienia: sekcja Kalendarz Google bez kluczy w .env wyjaśnia, co zrobić, a program działa', async ({
  page,
}) => {
  await page.goto('/ustawienia');
  await page.getByRole('link', { name: '📅 Kalendarz Google' }).click();
  await expect(page.getByRole('heading', { name: /Kalendarz Google/ })).toBeVisible();
  await expect(page.getByText(/Brak kluczy Google w pliku \.env/)).toBeVisible();
  await expect(page.getByRole('button', { name: /Połącz z Kalendarzem Google/ })).toHaveCount(0);
  await page.goto('/');
  await expect(page.locator('.calendar-banner')).toHaveCount(0);
});
