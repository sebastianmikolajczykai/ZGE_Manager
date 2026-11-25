import type { AppDatabase } from '../../db.js';
import type { LocalDate } from '../urgency/day-counter.js';
import { requirePerson } from '../common/form-fields.js';
import { CalendarApiError, type CalendarApi } from './calendar-api.js';
import {
  CalendarSyncRepository,
  type SyncHistoryAction,
  type SyncHistoryEntry,
  type TrackedEvent,
} from './calendar-sync-repository.js';
import { planReminders, type DueDates, type PlannedReminder, type ReminderSource } from './reminder-plan.js';

/** Nazwa osobnego kalendarza w Google; aplikacja ma dostęp tylko do niego. */
export const CALENDAR_NAME = 'ZGE przypomnienia';

export const NOT_CONFIGURED_MESSAGE =
  'Brak kluczy Google w pliku .env (GOOGLE_CLIENT_ID i GOOGLE_CLIENT_SECRET). Instrukcja w README.';
export const NOT_CONNECTED_MESSAGE =
  'Nie połączono z kontem Google. W Ustawieniach kliknij „Połącz z Kalendarzem Google”.';

export interface CalendarSyncDeps {
  db: AppDatabase;
  /** null = brak kluczy Google w .env (synchronizacja niemożliwa). */
  api: CalendarApi | null;
  /** Czy jest zapisany token konta Google. */
  isConnected: () => boolean;
  /** Otwarte oferty i niezapłacone zlecenia (liczone na nowo przy każdej synchronizacji). */
  sources: () => ReminderSource[];
  days: DueDates;
  today: () => LocalDate;
  now?: () => Date;
  /** Adres aplikacji w biurze (do linku w opisie wydarzenia). */
  appUrl: string;
}

export interface SyncStatus {
  enabled: boolean;
  /** Są klucze Google w .env. */
  configured: boolean;
  connected: boolean;
  /** Ostatnia udana synchronizacja (ISO) albo null. */
  lastOkAt: string | null;
  /** Komunikat ostatniego błędu albo null, gdy ostatnia synchronizacja się udała. */
  lastError: string | null;
  /** Ile wydarzeń aplikacja ma teraz w kalendarzu. */
  eventCount: number;
  history: SyncHistoryEntry[];
}

export interface SyncResult {
  ok: boolean;
  error: string | null;
}

/**
 * Synchronizacja przypomnień „Zadzwoń” z kalendarzem „ZGE przypomnienia”.
 * Za każdym razem porównuje, co powinno być w kalendarzu, z tym, co aplikacja tam założyła:
 * brakujące dodaje, zmienione przesuwa, zamknięte usuwa. Błąd nie psuje aplikacji: zostaje zapisany
 * jako czytelny komunikat, a następna synchronizacja próbuje od nowa.
 */
export class CalendarSyncService {
  private readonly repo: CalendarSyncRepository;
  private running: Promise<SyncResult> | null = null;
  private rerunRequested = false;

  constructor(private readonly deps: CalendarSyncDeps) {
    this.repo = new CalendarSyncRepository(deps.db);
  }

  status(): SyncStatus {
    return {
      enabled: this.isEnabled(),
      configured: this.deps.api !== null,
      connected: this.deps.isConnected(),
      lastOkAt: this.repo.get('lastOkAt'),
      lastError: this.repo.get('lastError'),
      eventCount: this.repo.tracked().length,
      history: this.repo.history(),
    };
  }

  setEnabled(on: boolean, person: string): void {
    const who = requirePerson(person);
    if (this.isEnabled() === on) return;
    this.repo.set('enabled', on ? '1' : null);
    this.repo.log(this.deps.today(), who, on ? 'enabled' : 'disabled');
  }

  /** Wpis w historii po połączeniu lub odłączeniu konta Google. */
  logAccount(action: Extract<SyncHistoryAction, 'connected' | 'disconnected'>, person: string): void {
    this.repo.log(this.deps.today(), requirePerson(person), action);
    if (action === 'connected') this.repo.set('lastError', null);
  }

  /**
   * Uruchamia synchronizację; nigdy nie rzuca wyjątku. Gdy jedna już trwa, nie startuje drugiej
   * równolegle (byłyby podwójne wydarzenia), tylko powtarza ją raz po zakończeniu.
   */
  async syncNow(): Promise<SyncResult> {
    if (this.running) {
      this.rerunRequested = true;
      return this.running;
    }
    this.running = this.runUntilSettled();
    try {
      return await this.running;
    } finally {
      this.running = null;
    }
  }

  private async runUntilSettled(): Promise<SyncResult> {
    let result: SyncResult;
    do {
      this.rerunRequested = false;
      result = await this.syncOnce();
    } while (this.rerunRequested);
    return result;
  }

  private async syncOnce(): Promise<SyncResult> {
    const wanted = this.isEnabled() ? this.plan() : [];
    const tracked = this.repo.tracked();
    if (wanted.length === 0 && tracked.length === 0) return this.succeeded();
    const { api } = this.deps;
    if (api === null) return this.failed(NOT_CONFIGURED_MESSAGE);
    if (!this.deps.isConnected()) return this.failed(NOT_CONNECTED_MESSAGE);
    try {
      await this.removeStale(api, tracked, wanted);
      if (wanted.length > 0) await this.applyWanted(api, wanted);
      return this.succeeded();
    } catch (err) {
      return this.failed(this.describeError(err));
    }
  }

  private plan(): PlannedReminder[] {
    return planReminders(this.deps.sources(), this.deps.days, this.deps.today(), this.deps.appUrl);
  }

  private async removeStale(api: CalendarApi, tracked: TrackedEvent[], wanted: PlannedReminder[]) {
    const wantedKeys = new Set(wanted.map((w) => w.key));
    const calendarId = this.repo.get('calendarId');
    for (const event of tracked.filter((t) => !wantedKeys.has(t.key))) {
      if (calendarId !== null) await ignoreNotFound(api.deleteEvent(calendarId, event.eventId));
      this.repo.removeTracked(event.key);
    }
  }

  private async applyWanted(api: CalendarApi, wanted: PlannedReminder[]): Promise<void> {
    const calendarId = await this.ensureCalendar(api);
    const tracked = new Map(this.repo.tracked().map((t) => [t.key, t]));
    for (const reminder of wanted) {
      const existing = tracked.get(reminder.key);
      if (existing && sameContent(existing, reminder)) continue;
      const eventId = existing
        ? await this.updateOrRecreate(api, calendarId, existing.eventId, reminder)
        : await this.insert(api, calendarId, reminder);
      this.repo.saveTracked({ ...reminder, eventId });
    }
  }

  private async updateOrRecreate(api: CalendarApi, calendarId: string, eventId: string, r: PlannedReminder) {
    try {
      await api.updateEvent(calendarId, eventId, r);
      return eventId;
    } catch (err) {
      if (!isNotFound(err)) throw err;
      return this.insert(api, calendarId, r); // ktoś usunął wydarzenie ręcznie w Google
    }
  }

  private async insert(api: CalendarApi, calendarId: string, r: PlannedReminder): Promise<string> {
    try {
      return await api.insertEvent(calendarId, r);
    } catch (err) {
      if (!isNotFound(err)) throw err;
      // Kalendarz usunięty ręcznie w Google: następna synchronizacja założy go od nowa.
      this.repo.set('calendarId', null);
      this.repo.clearTracked();
      throw new CalendarRemovedError();
    }
  }

  private async ensureCalendar(api: CalendarApi): Promise<string> {
    const saved = this.repo.get('calendarId');
    if (saved !== null) return saved;
    const created = await api.createCalendar(CALENDAR_NAME);
    this.repo.set('calendarId', created);
    return created;
  }

  private describeError(err: unknown): string {
    if (err instanceof CalendarApiError || err instanceof CalendarRemovedError) return err.message;
    const text = err instanceof Error ? err.message : String(err);
    console.error('Synchronizacja z Kalendarzem Google:', err);
    return `Nieoczekiwany błąd synchronizacji z Kalendarzem Google: ${text}`;
  }

  private succeeded(): SyncResult {
    this.repo.set('lastOkAt', (this.deps.now ?? (() => new Date()))().toISOString());
    this.repo.set('lastError', null);
    return { ok: true, error: null };
  }

  private failed(error: string): SyncResult {
    this.repo.set('lastError', error);
    return { ok: false, error };
  }

  private isEnabled(): boolean {
    return this.repo.get('enabled') === '1';
  }
}

/** Kalendarz „ZGE przypomnienia” usunięty ręcznie w Google. */
class CalendarRemovedError extends Error {
  constructor() {
    super(
      `Kalendarz „${CALENDAR_NAME}” został usunięty w Google. Założę go ponownie przy następnej synchronizacji.`,
    );
    this.name = 'CalendarRemovedError';
  }
}

function sameContent(a: PlannedReminder, b: PlannedReminder): boolean {
  return a.date === b.date && a.title === b.title && a.description === b.description;
}

function isNotFound(err: unknown): boolean {
  return err instanceof CalendarApiError && err.kind === 'not_found';
}

/** Usuwanie wydarzenia, którego już nie ma w Google, to nie błąd. */
async function ignoreNotFound(work: Promise<void>): Promise<void> {
  try {
    await work;
  } catch (err) {
    if (!isNotFound(err)) throw err;
  }
}
