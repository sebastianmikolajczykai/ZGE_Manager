import { test, expect } from '@playwright/test';
import { clickAndConfirm } from './confirm.js';

test('cała ścieżka: dodanie zlecenia, odhaczenie z wyborem osoby, cofnięcie, historia', async ({ page }) => {
  const client = `Klient E2E ${Date.now()}`;
  await page.goto('/');
  await page.getByRole('link', { name: '+ Dodaj zlecenie' }).click();

  await page.getByLabel('Klient').fill(client);
  await page.getByLabel('Telefon').fill('600 100 200');
  await page.getByLabel('Miejscowość').fill('Przykładowo');
  await page.getByLabel('Rodzaj pracy').selectOption({ label: 'Podział nieruchomości' });
  await page.getByLabel('Data pomiaru').fill('2030-01-15');
  await page.getByLabel('Kto przyjął').selectOption('Łukasz');
  await page.getByRole('button', { name: 'Zapisz zlecenie' }).click();

  const panel = page.getByRole('region', { name: 'Szczegóły zlecenia' });
  await expect(panel.getByRole('heading', { name: client })).toBeVisible();
  await expect(panel.getByText('Ustalenie terminu pomiaru w terenie', { exact: true })).toBeVisible();
  await expect(page.getByRole('row', { name: new RegExp(client) })).toBeVisible();

  // Historia jest zwinięta; po rozwinięciu przeglądarka pamięta to także po przeładowaniu strony.
  await panel.getByText(/^Historia \(\d+\)$/).click();
  await clickAndConfirm(page, panel.getByRole('button', { name: 'Zrobione: Bartek' }));
  await expect(panel.getByText('Zrobione kroki (1)')).toBeVisible();
  await expect(panel.getByText('Bartek: zrobione „Ustalenie terminu pomiaru w terenie”')).toBeVisible();
  await expect(page.getByRole('row', { name: new RegExp(client) })).toContainText(
    'Analiza materiałów w urzędzie',
  );

  await panel.getByText('Cofnij ostatnie odhaczenie (pomyłka)').click();
  await clickAndConfirm(page, panel.getByRole('button', { name: 'Cofnij: Marcelina' }));
  await expect(panel.getByText('Marcelina: cofnięcie „Ustalenie terminu pomiaru w terenie”')).toBeVisible();
  await expect(page.getByRole('row', { name: new RegExp(client) })).toContainText(
    'Ustalenie terminu pomiaru w terenie',
  );
});

test('formularz pokazuje czytelny błąd przy złym telefonie', async ({ page }) => {
  await page.goto('/zlecenia/nowe');
  await page.getByLabel('Klient').fill('Ktoś');
  await page.getByLabel('Telefon').fill('123');
  await page.getByLabel('Miejscowość').fill('Gdzieś');
  await page.getByLabel('Data pomiaru').fill('2030-01-15');
  await page.getByRole('button', { name: 'Zapisz zlecenie' }).click();
  await expect(page.getByRole('alert')).toContainText('Nieprawidłowy numer telefonu');
  await expect(page.getByLabel('Klient')).toHaveValue('Ktoś');
});

test('wyszukiwarka na Tablicy pokazuje tylko pasujące zlecenia', async ({ page }) => {
  const stamp = Date.now();
  for (const name of [`Szukany ${stamp}`, `Inny ${stamp}`]) {
    await page.goto('/zlecenia/nowe');
    await page.getByLabel('Klient').fill(name);
    await page.getByLabel('Telefon').fill('600 100 200');
    await page.getByLabel('Miejscowość').fill('Przykładowo');
    await page.getByLabel('Data pomiaru').fill('2030-01-15');
    await page.getByRole('button', { name: 'Zapisz zlecenie' }).click();
  }
  await page.goto('/');
  await page.getByRole('searchbox', { name: 'Szukaj' }).fill(`szukany ${stamp}`);
  await expect(page.getByRole('row', { name: new RegExp(`Szukany ${stamp}`) })).toBeVisible();
  await expect(page.getByRole('row', { name: new RegExp(`Inny ${stamp}`) })).toBeHidden();

  await page.getByRole('searchbox', { name: 'Szukaj' }).fill('nie ma takiego klienta xyz');
  await expect(page.getByText('Nic nie pasuje do wyszukiwania.')).toBeVisible();
});

test('okienko „Czy na pewno?”: Anuluj nic nie zapisuje, „Tak, zapisz” odhacza krok', async ({ page }) => {
  const client = `Potwierdzenie E2E ${Date.now()}`;
  await page.goto('/zlecenia/nowe');
  await page.getByLabel('Klient').fill(client);
  await page.getByLabel('Telefon').fill('600 100 200');
  await page.getByLabel('Miejscowość').fill('Przykładowo');
  await page.getByLabel('Data pomiaru').fill('2030-01-15');
  await page.getByRole('button', { name: 'Zapisz zlecenie' }).click();

  const panel = page.getByRole('region', { name: 'Szczegóły zlecenia' });
  await panel.getByRole('button', { name: 'Zrobione: Bartek' }).click();
  const dialog = page.getByRole('dialog', { name: 'Czy na pewno?' });
  await expect(dialog).toContainText('Zrobione: Bartek');
  await dialog.getByRole('button', { name: 'Anuluj' }).click();
  await expect(dialog).toBeHidden();
  await expect(panel.getByText('Zrobione kroki')).toHaveCount(0);

  await clickAndConfirm(page, panel.getByRole('button', { name: 'Zrobione: Bartek' }));
  await expect(panel.getByText('Zrobione kroki (1)')).toBeVisible();
});

test('kroki do zrobienia można zwinąć i rozwinąć', async ({ page }) => {
  await page.goto('/zlecenia/nowe');
  await page.getByLabel('Klient').fill(`Zwijanie E2E ${Date.now()}`);
  await page.getByLabel('Telefon').fill('600 100 200');
  await page.getByLabel('Miejscowość').fill('Przykładowo');
  await page.getByLabel('Data pomiaru').fill('2030-01-15');
  await page.getByRole('button', { name: 'Zapisz zlecenie' }).click();

  const panel = page.getByRole('region', { name: 'Szczegóły zlecenia' });
  await expect(panel.getByText('Analiza materiałów w urzędzie', { exact: true })).toBeHidden();
  await panel.getByText(/^Do zrobienia \(\d+\)$/).click();
  await expect(panel.getByText('Analiza materiałów w urzędzie', { exact: true })).toBeVisible();
});

test('cofanie do wybranego wpisu historii: kilka kroków naraz, z pytaniem „Czy na pewno?”', async ({
  page,
}) => {
  const client = `Cofanie do wpisu E2E ${Date.now()}`;
  await page.goto('/zlecenia/nowe');
  await page.getByLabel('Klient').fill(client);
  await page.getByLabel('Telefon').fill('600 100 200');
  await page.getByLabel('Miejscowość').fill('Przykładowo');
  await page.getByLabel('Rodzaj pracy').selectOption({ label: 'Podział nieruchomości' });
  await page.getByLabel('Data pomiaru').fill('2030-01-15');
  await page.getByLabel('Kto przyjął').selectOption('Łukasz');
  await page.getByRole('button', { name: 'Zapisz zlecenie' }).click();

  const panel = page.getByRole('region', { name: 'Szczegóły zlecenia' });
  await panel.getByText(/^Historia \(\d+\)$/).click();
  for (let done = 1; done <= 3; done++) {
    await clickAndConfirm(page, panel.getByRole('button', { name: 'Zrobione: Bartek' }));
    await expect(panel.getByText(`Zrobione kroki (${done})`)).toBeVisible();
  }

  await panel.getByText('Bartek: zrobione „Analiza materiałów w urzędzie”').click();
  await expect(panel.getByText('Cofnie 2 wpisy (ten i nowsze), tylko w tym zleceniu.')).toBeVisible();
  await clickAndConfirm(page, panel.getByRole('button', { name: 'Cofnij 2 wpisy: Łukasz' }));

  await expect(panel.getByText('Zrobione kroki (1)')).toBeVisible();
  await expect(page.getByRole('row', { name: new RegExp(client) })).toContainText(
    'Analiza materiałów w urzędzie',
  );
  await expect(panel.getByText('Łukasz: cofnięcie „Wysłanie zawiadomień”')).toBeVisible();
  await expect(panel.getByText('Łukasz: cofnięcie „Analiza materiałów w urzędzie”')).toBeVisible();
});
