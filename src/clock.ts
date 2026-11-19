import type { LocalDate } from './modules/urgency/day-counter.js';

const WARSAW_DATE = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Warsaw' });

/** Dzisiejsza data w Polsce (RRRR-MM-DD), niezależnie od strefy czasowej komputera. */
export function warsawDate(now: Date = new Date()): LocalDate {
  return WARSAW_DATE.format(now);
}
