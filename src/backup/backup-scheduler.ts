import type { LocalDate } from '../modules/urgency/day-counter.js';
import type { BackupResult } from './database-backup.js';

/** Co godzinę sprawdzamy, czy jest już dzisiejsza kopia (laptop bywa włączony całymi dniami). */
export const BACKUP_CHECK_INTERVAL_MS = 60 * 60 * 1000;

interface Backup {
  runIfDue(today: LocalDate): Promise<BackupResult>;
}

/** Uruchamia kopię zaraz po starcie aplikacji i potem co godzinę; błąd kopii tylko zgłasza. */
export class BackupScheduler {
  private timer: NodeJS.Timeout | undefined;

  constructor(
    private readonly backup: Backup,
    private readonly today: () => LocalDate,
    private readonly log: (message: string) => void,
  ) {}

  start(): void {
    this.check();
    this.timer = setInterval(() => this.check(), BACKUP_CHECK_INTERVAL_MS);
    this.timer.unref(); // timer nie trzyma procesu przy życiu przy zamykaniu
  }

  stop(): void {
    clearInterval(this.timer);
  }

  private check(): void {
    this.backup.runIfDue(this.today()).catch((error: unknown) => {
      const reason = error instanceof Error ? error.message : String(error);
      this.log(`Nie udało się zrobić kopii bazy: ${reason}`);
    });
  }
}
