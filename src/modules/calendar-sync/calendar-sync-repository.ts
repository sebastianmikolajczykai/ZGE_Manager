import type { AppDatabase } from '../../db.js';
import type { LocalDate } from '../urgency/day-counter.js';
import type { PlannedReminder } from './reminder-plan.js';

/** Wydarzenie założone przez aplikację w Google (klucz sprawy + numer wydarzenia). */
export interface TrackedEvent extends PlannedReminder {
  eventId: string;
}

export type SyncHistoryAction = 'enabled' | 'disabled' | 'connected' | 'disconnected';

export interface SyncHistoryEntry {
  happenedOn: LocalDate;
  person: string;
  action: SyncHistoryAction;
}

/** Klucze w tabeli stanu synchronizacji. */
export type StateKey = 'enabled' | 'calendarId' | 'lastOkAt' | 'lastError';

/** Zapis w bazie: które wydarzenia są w Google, stan synchronizacji i historia „kto, kiedy”. */
export class CalendarSyncRepository {
  constructor(private readonly db: AppDatabase) {}

  tracked(): TrackedEvent[] {
    const rows = this.db.connection
      .prepare('SELECT key, event_id, event_date, title, description FROM calendar_sync_events ORDER BY key')
      .all() as { key: string; event_id: string; event_date: string; title: string; description: string }[];
    return rows.map((r) => ({
      key: r.key,
      eventId: r.event_id,
      date: r.event_date,
      title: r.title,
      description: r.description,
    }));
  }

  saveTracked(event: TrackedEvent): void {
    this.db.connection
      .prepare(
        `INSERT INTO calendar_sync_events (key, event_id, event_date, title, description) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET event_id = excluded.event_id, event_date = excluded.event_date,
           title = excluded.title, description = excluded.description`,
      )
      .run(event.key, event.eventId, event.date, event.title, event.description);
  }

  removeTracked(key: string): void {
    this.db.connection.prepare('DELETE FROM calendar_sync_events WHERE key = ?').run(key);
  }

  clearTracked(): void {
    this.db.connection.prepare('DELETE FROM calendar_sync_events').run();
  }

  get(key: StateKey): string | null {
    const row = this.db.connection.prepare('SELECT value FROM calendar_sync_state WHERE key = ?').get(key) as
      { value: string } | undefined;
    return row?.value ?? null;
  }

  set(key: StateKey, value: string | null): void {
    if (value === null) {
      this.db.connection.prepare('DELETE FROM calendar_sync_state WHERE key = ?').run(key);
      return;
    }
    this.db.connection
      .prepare(
        'INSERT INTO calendar_sync_state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      )
      .run(key, value);
  }

  log(happenedOn: LocalDate, person: string, action: SyncHistoryAction): void {
    this.db.connection
      .prepare('INSERT INTO calendar_sync_history (happened_on, person, action) VALUES (?, ?, ?)')
      .run(happenedOn, person, action);
  }

  /** Najnowsze wpisy na górze. */
  history(): SyncHistoryEntry[] {
    const rows = this.db.connection
      .prepare('SELECT happened_on, person, action FROM calendar_sync_history ORDER BY id DESC')
      .all() as { happened_on: string; person: string; action: SyncHistoryAction }[];
    return rows.map((r) => ({ happenedOn: r.happened_on, person: r.person, action: r.action }));
  }
}
