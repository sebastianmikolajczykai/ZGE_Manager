import { DayCounter, type LocalDate } from '../urgency/day-counter.js';
import { optional, parsePhone, parsePrice, required } from '../common/form-fields.js';

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
  /** Data pomiaru w terenie; opcjonalna (termin bywa uzgadniany z urzędem, dopisuje się go później z karty zlecenia). */
  measurementOn: LocalDate | null;
}

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
    measurementOn: parseMeasurementDate(raw.measurementOn),
  };
}

function parseWorkTypeId(value: number): number {
  if (!Number.isInteger(value) || value < 1) throw new Error('Wybierz rodzaj pracy');
  return value;
}

/** Sprawdza datę pomiaru w formacie RRRR-MM-DD (null = brak daty). */
export function parseMeasurementDate(value: LocalDate | null): LocalDate | null {
  if (value === null) return null;
  try {
    dateChecker.daysBetween(value, value);
  } catch {
    throw new Error(`Nieprawidłowa data pomiaru: „${value}”`);
  }
  return value;
}
