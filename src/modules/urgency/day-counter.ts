import { PolishHolidays } from './polish-holidays.js';

/** Sposób liczenia dni: robocze (pn–pt bez świąt) albo wszystkie kalendarzowe. */
export type DayMode = 'working' | 'calendar';

/** Data bez godziny w formacie RRRR-MM-DD (np. 2026-11-19). */
export type LocalDate = string;

const MS_PER_DAY = 86_400_000;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const SATURDAY = 6;
const SUNDAY = 0;

/** Liczy dni między datami. Działa na datach bez godzin, więc zmiana czasu nie ma wpływu. */
export class DayCounter {
  constructor(
    private readonly mode: DayMode,
    private readonly holidays: PolishHolidays = new PolishHolidays(),
  ) {}

  /** Czy w danym dniu się pracuje (w trybie kalendarzowym: zawsze tak). */
  isWorkingDay(date: LocalDate): boolean {
    return this.mode === 'calendar' || this.isWorkingEpochDay(toEpochDay(date));
  }

  /** Liczba dni w przedziale (from, to]: dzień startu się nie liczy, dzień końcowy tak. */
  daysBetween(from: LocalDate, to: LocalDate): number {
    const start = toEpochDay(from);
    const end = toEpochDay(to);
    if (end < start) throw new Error(`Data ${to} jest wcześniejsza niż ${from}`);
    if (this.mode === 'calendar') return end - start;
    let count = 0;
    for (let day = start + 1; day <= end; day++) if (this.isWorkingEpochDay(day)) count++;
    return count;
  }

  private isWorkingEpochDay(epochDay: number): boolean {
    return isWeekday(epochDay) && !this.holidays.isHoliday(toIsoDate(epochDay));
  }
}

function toEpochDay(date: LocalDate): number {
  const match = ISO_DATE.exec(date);
  if (!match) throw new Error(`Nieprawidłowa data: ${date} (oczekiwano RRRR-MM-DD)`);
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const ms = Date.UTC(year, month - 1, day);
  const check = new Date(ms);
  if (check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) {
    throw new Error(`Nieprawidłowa data: ${date}`);
  }
  return ms / MS_PER_DAY;
}

function toIsoDate(epochDay: number): LocalDate {
  return new Date(epochDay * MS_PER_DAY).toISOString().slice(0, 10);
}

function isWeekday(epochDay: number): boolean {
  const weekday = new Date(epochDay * MS_PER_DAY).getUTCDay();
  return weekday !== SATURDAY && weekday !== SUNDAY;
}
