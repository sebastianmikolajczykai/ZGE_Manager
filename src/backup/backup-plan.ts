import type { LocalDate } from '../modules/urgency/day-counter.js';

/** Tylko pliki o tej nazwie są kopiami robionymi przez aplikację (i tylko je wolno usuwać). */
const DAILY_BACKUP = /^zge-\d{4}-\d{2}-\d{2}\.db$/;

/** Nazwa kopii z danego dnia, np. zge-2026-11-24.db. */
export function backupFileName(day: LocalDate): string {
  return `zge-${day}.db`;
}

/** Kopia przed aktualizacją programu, np. zge-przed-aktualizacja-2026-11-24.db (druga tego dnia: …-2.db). */
export function updateBackupFileName(day: LocalDate, number: number): string {
  return number === 1 ? `zge-przed-aktualizacja-${day}.db` : `zge-przed-aktualizacja-${day}-${number}.db`;
}

/** Najstarsze kopie ponad limit (nazwy z datą RRRR-MM-DD sortują się tak jak daty). */
export function backupsToDelete(fileNames: readonly string[], keep: number): string[] {
  const backups = fileNames.filter((name) => DAILY_BACKUP.test(name)).sort();
  return backups.slice(0, Math.max(0, backups.length - keep));
}
