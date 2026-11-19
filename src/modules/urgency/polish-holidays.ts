/**
 * Polskie dni ustawowo wolne od pracy, które wypadają w dni powszednie lub weekendy.
 * Źródło listy: ustawa o dniach wolnych od pracy; Wigilia (24.12) wolna od 2025 r.
 */
const FIXED_HOLIDAYS: readonly string[] = [
  '01-01',
  '01-06',
  '05-01',
  '05-03',
  '08-15',
  '11-01',
  '11-11',
  '12-25',
  '12-26',
];
const CHRISTMAS_EVE = '12-24';
const CHRISTMAS_EVE_FREE_FROM_YEAR = 2025;
const EASTER_MONDAY_OFFSET = 1;
const CORPUS_CHRISTI_OFFSET = 60;
const MS_PER_DAY = 86_400_000;

/** Sprawdza, czy data (RRRR-MM-DD) jest świętem; wynik dla każdego roku liczony raz. */
export class PolishHolidays {
  private readonly cache = new Map<number, Set<string>>();

  isHoliday(isoDate: string): boolean {
    const year = Number(isoDate.slice(0, 4));
    return this.forYear(year).has(isoDate);
  }

  private forYear(year: number): Set<string> {
    const cached = this.cache.get(year);
    if (cached) return cached;
    const days = new Set(FIXED_HOLIDAYS.map((md) => `${year}-${md}`));
    if (year >= CHRISTMAS_EVE_FREE_FROM_YEAR) days.add(`${year}-${CHRISTMAS_EVE}`);
    const easter = easterSunday(year);
    days.add(shift(easter, 0));
    days.add(shift(easter, EASTER_MONDAY_OFFSET));
    days.add(shift(easter, CORPUS_CHRISTI_OFFSET));
    this.cache.set(year, days);
    return days;
  }
}

/** Wielkanoc w kalendarzu gregoriańskim (algorytm Meeusa/Jonesa/Butchera), jako czas UTC w ms. */
function easterSunday(year: number): number {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return Date.UTC(year, month - 1, day);
}

function shift(utcMs: number, days: number): string {
  return new Date(utcMs + days * MS_PER_DAY).toISOString().slice(0, 10);
}
