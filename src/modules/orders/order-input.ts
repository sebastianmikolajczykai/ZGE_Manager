import { DayCounter, type LocalDate } from '../urgency/day-counter.js';

/** Dane zlecenia wpisywane przy dodawaniu. */
export interface OrderInput {
  clientName: string;
  phone: string;
  town: string;
  workTypeId: number;
  plot: string | null;
  office: string | null;
  pricePln: number | null;
  note: string | null;
  /** Data pomiaru w terenie (wymagana, gdy rodzaj pracy ma krok „w ustalonym dniu”). */
  measurementOn: LocalDate | null;
}

const MIN_PHONE_DIGITS = 9;
const MAX_PHONE_DIGITS = 12;
const PHONE_ALLOWED = /^\+?[\d\s-]+$/;
const GROSZE_PER_PLN = 100;
const dateChecker = new DayCounter('calendar');

/** Sprawdza i porządkuje dane zlecenia; rzuca czytelny błąd przy złych danych. */
export function parseOrderInput(raw: OrderInput): OrderInput {
  return {
    clientName: required(raw.clientName, 'Klient'),
    phone: parsePhone(raw.phone),
    town: required(raw.town, 'Miejscowość'),
    workTypeId: parseWorkTypeId(raw.workTypeId),
    plot: optional(raw.plot),
    office: optional(raw.office),
    pricePln: parsePrice(raw.pricePln),
    note: optional(raw.note),
    measurementOn: parseDate(raw.measurementOn),
  };
}

function required(value: string, label: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`Pole „${label}” jest wymagane`);
  return trimmed;
}

function optional(value: string | null): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed === '' ? null : trimmed;
}

function parsePhone(value: string): string {
  const trimmed = value.trim();
  const digits = trimmed.replace(/\D/g, '').length;
  if (!PHONE_ALLOWED.test(trimmed) || digits < MIN_PHONE_DIGITS || digits > MAX_PHONE_DIGITS) {
    throw new Error(`Nieprawidłowy numer telefonu: „${value}”`);
  }
  return trimmed;
}

function parseWorkTypeId(value: number): number {
  if (!Number.isInteger(value) || value < 1) throw new Error('Wybierz rodzaj pracy');
  return value;
}

function parsePrice(value: number | null): number | null {
  if (value === null) return null;
  const hasAtMostTwoDecimals = Number.isInteger(Math.round(value * GROSZE_PER_PLN * 1e6) / 1e6);
  if (!Number.isFinite(value) || value < 0 || !hasAtMostTwoDecimals) {
    throw new Error(`Nieprawidłowa cena: ${value} (podaj kwotę w zł, najwyżej 2 miejsca po przecinku)`);
  }
  return value;
}

function parseDate(value: LocalDate | null): LocalDate | null {
  if (value === null) return null;
  try {
    dateChecker.daysBetween(value, value);
  } catch {
    throw new Error(`Nieprawidłowa data pomiaru: „${value}”`);
  }
  return value;
}
