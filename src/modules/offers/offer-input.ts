import { DayCounter, type LocalDate } from '../urgency/day-counter.js';
import { optional, parsePhone, parsePrice, required } from '../common/form-fields.js';

/** Dane oferty wpisywane przy dodawaniu. */
export interface OfferInput {
  clientName: string;
  phone: string;
  workTypeId: number;
  /** Dzień wysłania oferty = dzień 0 odliczania. */
  sentOn: LocalDate;
  town: string | null;
  plot: string | null;
  pricePln: number | null;
  note: string | null;
}

const dateChecker = new DayCounter('calendar');

/** Sprawdza i porządkuje dane oferty; rzuca czytelny błąd przy złych danych. */
export function parseOfferInput(raw: OfferInput, today: LocalDate): OfferInput {
  return {
    clientName: required(raw.clientName, 'Klient'),
    phone: parsePhone(raw.phone),
    workTypeId: parseWorkTypeId(raw.workTypeId),
    sentOn: parseSentOn(raw.sentOn, today),
    town: optional(raw.town),
    plot: optional(raw.plot),
    pricePln: parsePrice(raw.pricePln),
    note: optional(raw.note),
  };
}

function parseWorkTypeId(value: number): number {
  if (!Number.isInteger(value) || value < 1) throw new Error('Wybierz rodzaj pracy');
  return value;
}

function parseSentOn(value: LocalDate, today: LocalDate): LocalDate {
  try {
    dateChecker.daysBetween(value, value);
  } catch {
    throw new Error(`Nieprawidłowa data wysłania: „${value}”`);
  }
  // Daty RRRR-MM-DD porównują się poprawnie jako tekst.
  if (value > today) throw new Error(`Data wysłania ${value} jest w przyszłości`);
  return value;
}
