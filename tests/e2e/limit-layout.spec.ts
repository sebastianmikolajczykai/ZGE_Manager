import { test, expect, type Locator, type Page } from '@playwright/test';

/** Prostokąt elementu na ekranie (zgłasza błąd, gdy element nie jest widoczny). */
async function box(locator: Locator): Promise<{ x: number; y: number; width: number; height: number }> {
  const b = await locator.boundingBox();
  if (!b) throw new Error('Element nie jest widoczny na ekranie');
  return b;
}

/** Czy dwa prostokąty na siebie nachodzą (zasłaniają się). */
function overlaps(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

async function addOrder(page: Page, client: string): Promise<void> {
  await page.goto('/zlecenia/nowe');
  await page.getByLabel('Klient').fill(client);
  await page.getByLabel('Telefon').fill('600 100 200');
  await page.getByLabel('Miejscowość').fill('Przykładowo');
  await page.getByLabel('Rodzaj pracy').selectOption({ label: 'Podział nieruchomości' });
  await page.getByLabel('Kto przyjął').selectOption('Łukasz');
  await page.getByRole('button', { name: 'Zapisz zlecenie' }).click();
}

// Szerokości: telefon, wąskie okno laptopa (jak na zgłoszonym zrzucie), pełny laptop.
for (const width of [390, 735, 1366]) {
  test(`„Zmień limit tego kroku”: − / + nie zasłaniają opisu (szerokość ${width}px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await addOrder(page, `Klient układ ${width} ${Date.now()}`);

    const panel = page.getByRole('region', { name: 'Szczegóły zlecenia' });
    await panel.getByText('Zmień limit tego kroku').click();

    const label = panel.locator('.limit-change label.setting');
    const title = label.getByText('Nowy limit', { exact: true });
    const hint = label.getByText('dni roboczych od rozpoczęcia kroku, tylko w tym zleceniu');
    const minus = label.getByRole('button', { name: 'Zmniejsz: Nowy limit' });
    const plus = label.getByRole('button', { name: 'Zwiększ: Nowy limit' });
    const input = label.getByRole('spinbutton');

    for (const control of [minus, input, plus]) {
      expect(overlaps(await box(control), await box(hint))).toBe(false);
      expect(overlaps(await box(control), await box(title))).toBe(false);
    }
    // Opis czytelny, nie ściśnięty w wąską kolumnę po jednym słowie: mieści się w najwyżej 3 wierszach.
    expect((await box(hint)).height).toBeLessThan(3 * 24);
    // Kontrolka mieści się w panelu (nic nie wystaje poza kartę).
    const panelBox = await box(panel);
    const plusBox = await box(plus);
    expect(plusBox.x + plusBox.width).toBeLessThanOrEqual(panelBox.x + panelBox.width);
    expect((await box(minus)).x).toBeGreaterThanOrEqual(panelBox.x);
  });
}
