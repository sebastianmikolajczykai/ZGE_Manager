import { expect, type Locator, type Page } from '@playwright/test';

/** Kliknięcie osoby na karcie i potwierdzenie w okienku „Czy na pewno?” (czeka na przeładowanie strony). */
export async function clickAndConfirm(page: Page, button: Locator): Promise<void> {
  await button.click();
  const dialog = page.getByRole('dialog', { name: 'Czy na pewno?' });
  await expect(dialog).toBeVisible();
  await Promise.all([page.waitForEvent('load'), dialog.getByRole('button', { name: 'Tak, zapisz' }).click()]);
}
