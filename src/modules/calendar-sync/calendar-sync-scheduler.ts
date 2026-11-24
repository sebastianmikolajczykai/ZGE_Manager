import type { SyncResult } from './calendar-sync-service.js';

/** Co ile sprawdzamy kalendarz (np. przesunięcie przeterminowanych na kolejny dzień, powrót internetu). */
export const SYNC_INTERVAL_MS = 5 * 60 * 1000;
/** Po kliknięciu w aplikacji synchronizujemy po chwili (kilka kliknięć z rzędu = jedna synchronizacja). */
export const NUDGE_DELAY_MS = 2000;

interface Syncable {
  syncNow(): Promise<SyncResult>;
}

/** Uruchamia synchronizację po starcie, co 5 minut i chwilę po każdej zmianie w aplikacji. */
export class CalendarSyncScheduler {
  private interval: NodeJS.Timeout | undefined;
  private pendingNudge: NodeJS.Timeout | undefined;

  constructor(private readonly sync: Syncable) {}

  start(): void {
    this.run();
    this.interval = setInterval(() => this.run(), SYNC_INTERVAL_MS);
    this.interval.unref(); // timer nie trzyma procesu przy życiu przy zamykaniu
  }

  /** Coś się zmieniło (np. ktoś zadzwonił, oferta zamknięta): zsynchronizuj za chwilę. */
  nudge(): void {
    clearTimeout(this.pendingNudge);
    this.pendingNudge = setTimeout(() => this.run(), NUDGE_DELAY_MS);
    this.pendingNudge.unref();
  }

  stop(): void {
    clearInterval(this.interval);
    clearTimeout(this.pendingNudge);
  }

  // syncNow nie rzuca wyjątków (błąd zapisuje jako komunikat w Ustawieniach).
  private run(): void {
    void this.sync.syncNow();
  }
}
