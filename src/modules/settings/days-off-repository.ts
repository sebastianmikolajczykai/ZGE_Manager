import type { AppDatabase } from '../../db.js';
import { DayCounter, type LocalDate } from '../urgency/day-counter.js';
import { optional, requirePerson } from '../common/form-fields.js';

export interface DaysOffInput {
  fromOn: string;
  /** Pusty = jeden dzień (taki sam jak „od”). */
  toOn: string;
  note: string | null;
}

export interface DaysOff {
  id: number;
  fromOn: LocalDate;
  toOn: LocalDate;
  note: string | null;
  addedBy: string;
}

/** Jeden wpis to najwyżej ok. kwartał – chroni przed literówką w roku (np. 2062 zamiast 2026). */
const MAX_PERIOD_DAYS = 92;
const calendar = new DayCounter('calendar');

/** Dni wolne firmy wpisywane w Ustawieniach. */
export class DaysOffRepository {
  constructor(private readonly db: AppDatabase) {}

  add(input: DaysOffInput, person: string): number {
    const who = requirePerson(person);
    const fromOn = input.fromOn.trim();
    if (!fromOn) throw new Error('Podaj, od kiedy są dni wolne');
    const toOn = input.toOn.trim() || fromOn;
    calendar.daysBetween(fromOn, fromOn); // sprawdza poprawność daty
    calendar.daysBetween(toOn, toOn);
    if (toOn < fromOn) throw new Error('Data „do” nie może być przed datą „od”');
    if (calendar.daysBetween(fromOn, toOn) + 1 > MAX_PERIOD_DAYS) {
      throw new Error(`Jeden wpis może mieć najwyżej ${MAX_PERIOD_DAYS} dni`);
    }
    const result = this.db.connection
      .prepare('INSERT INTO days_off (from_on, to_on, note, added_by) VALUES (?, ?, ?, ?)')
      .run(fromOn, toOn, optional(input.note), who);
    return Number(result.lastInsertRowid);
  }

  /** Okresy, które jeszcze trwają lub dopiero będą, od najbliższego. */
  list(today: LocalDate): DaysOff[] {
    const rows = this.db.connection
      .prepare(
        'SELECT id, from_on, to_on, note, added_by FROM days_off WHERE to_on >= ? ORDER BY from_on, id',
      )
      .all(today) as { id: number; from_on: string; to_on: string; note: string | null; added_by: string }[];
    return rows.map((r) => ({
      id: r.id,
      fromOn: r.from_on,
      toOn: r.to_on,
      note: r.note,
      addedBy: r.added_by,
    }));
  }

  remove(id: number): void {
    this.db.connection.prepare('DELETE FROM days_off WHERE id = ?').run(id);
  }

  /** Funkcja „czy ten dzień jest wolny” (wszystkie okresy, także minione – liczą się w starych sprawach). */
  checker(): (date: LocalDate) => boolean {
    const periods = this.db.connection.prepare('SELECT from_on, to_on FROM days_off').all() as {
      from_on: string;
      to_on: string;
    }[];
    return (date) => periods.some((p) => p.from_on <= date && date <= p.to_on);
  }
}
