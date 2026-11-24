import { existsSync, mkdirSync, readdirSync, renameSync, rmSync } from 'node:fs';
import path from 'node:path';
import type { AppDatabase } from '../db.js';
import type { LocalDate } from '../modules/urgency/day-counter.js';
import { backupFileName, backupsToDelete } from './backup-plan.js';

export type BackupResult = 'created' | 'already-done';

/** Codzienna kopia pliku bazy do osobnego folderu, z limitem liczby starych kopii. */
export class DatabaseBackup {
  constructor(
    private readonly db: AppDatabase,
    private readonly dir: string,
    private readonly keep: number,
  ) {
    if (!Number.isInteger(keep) || keep < 1)
      throw new Error(`Liczba kopii musi być co najmniej 1 (jest ${keep})`);
  }

  /** Robi kopię z dzisiejszą datą, jeśli jej jeszcze nie ma, a potem usuwa nadmiarowe stare kopie. */
  async runIfDue(today: LocalDate): Promise<BackupResult> {
    const target = path.join(this.dir, backupFileName(today));
    if (existsSync(target)) return 'already-done';
    mkdirSync(this.dir, { recursive: true });
    // Najpierw plik tymczasowy: niedokończona kopia nigdy nie udaje gotowej (np. przy wyłączeniu prądu).
    const unfinished = `${target}.tmp`;
    await this.db.connection.backup(unfinished);
    renameSync(unfinished, target);
    this.removeOldCopies();
    return 'created';
  }

  private removeOldCopies(): void {
    for (const name of backupsToDelete(readdirSync(this.dir), this.keep)) {
      rmSync(path.join(this.dir, name));
    }
  }
}
