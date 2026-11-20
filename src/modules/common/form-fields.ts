/** Wspólne sprawdzanie pól formularzy (zlecenia, oferty). Rzuca czytelny błąd po polsku. */

const MIN_PHONE_DIGITS = 9;
const MAX_PHONE_DIGITS = 12;
const PHONE_ALLOWED = /^\+?[\d\s-]+$/;
const GROSZE_PER_PLN = 100;

export function required(value: string, label: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`Pole „${label}” jest wymagane`);
  return trimmed;
}

export function optional(value: string | null): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed === '' ? null : trimmed;
}

export function parsePhone(value: string): string {
  const trimmed = value.trim();
  const digits = trimmed.replace(/\D/g, '').length;
  if (!PHONE_ALLOWED.test(trimmed) || digits < MIN_PHONE_DIGITS || digits > MAX_PHONE_DIGITS) {
    throw new Error(`Nieprawidłowy numer telefonu: „${value}”`);
  }
  return trimmed;
}

export function parsePrice(value: number | null): number | null {
  if (value === null) return null;
  const hasAtMostTwoDecimals = Number.isInteger(Math.round(value * GROSZE_PER_PLN * 1e6) / 1e6);
  if (!Number.isFinite(value) || value < 0 || !hasAtMostTwoDecimals) {
    throw new Error(`Nieprawidłowa cena: ${value} (podaj kwotę w zł, najwyżej 2 miejsca po przecinku)`);
  }
  return value;
}

/** Imię osoby wykonującej czynność (przyciski Łukasz / Bartek / Marcelina). */
export function requirePerson(person: string): string {
  const who = person.trim();
  if (!who) throw new Error('Wybierz, kto wykonał czynność');
  return who;
}
