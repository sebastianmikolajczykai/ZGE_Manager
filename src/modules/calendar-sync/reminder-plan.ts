import type { LocalDate } from '../urgency/day-counter.js';

/**
 * Sprawa, o której trzeba przypomnieć telefonem: otwarta oferta albo zlecenie czekające na zapłatę.
 * Do Google trafia tylko numer i data; nazwisko, telefon i kwota zostają w aplikacji.
 */
export interface ReminderSource {
  kind: 'offer' | 'payment';
  /** Numer oferty albo zlecenia. */
  id: number;
  /** Wysłanie oferty / oddanie pracy albo ostatni telefon (od tego dnia liczymy termin). */
  lastContactOn: LocalDate;
  /** Po ilu dniach zadzwonić; null = bez limitu (bez przypomnienia). */
  limitDays: number | null;
  /** Numer zlecenia nadany w biurze (np. „125 podział”); brak = numer z aplikacji. Nigdy nazwisko klienta. */
  number?: string | null;
}

/** Wydarzenie, które powinno być w kalendarzu „ZGE przypomnienia”. */
export interface PlannedReminder {
  /** Stały klucz sprawy (np. „oferta-12”), po nim łączymy sprawę z wydarzeniem w Google. */
  key: string;
  /** Dzień wydarzenia całodniowego. */
  date: LocalDate;
  title: string;
  description: string;
}

/** Liczenie dni: robocze, bez świąt i dni wolnych firmy (UrgencyRules). */
export interface DueDates {
  addDays(from: LocalDate, days: number): LocalDate;
  workingDayOnOrAfter(date: LocalDate): LocalDate;
}

/** Tekst numeru sprawy w wydarzeniu: numer z biura, a gdy go nie ma, numer z aplikacji. */
export function reminderLabel(source: Pick<ReminderSource, 'kind' | 'id' | 'number'>): string {
  if (source.kind === 'offer') return `oferta nr ${source.id}`;
  return source.number ? `zapłata, zlecenie ${source.number}` : `zapłata, zlecenie nr ${source.id}`;
}

/**
 * Lista wydarzeń, które powinny być w kalendarzu dzisiaj.
 * Termin = ostatni kontakt + limit dni. Gdy termin minął, a nikt nie odznaczył telefonu,
 * wydarzenie przesuwa się na dziś (albo najbliższy dzień roboczy), więc ciągle jest widoczne.
 */
export function planReminders(
  sources: readonly ReminderSource[],
  days: DueDates,
  today: LocalDate,
  appUrl: string,
): PlannedReminder[] {
  return sources.flatMap((source) => {
    if (source.limitDays === null) return [];
    const due = days.addDays(source.lastContactOn, source.limitDays);
    // Daty RRRR-MM-DD porównują się poprawnie jako tekst.
    const date = due >= today ? due : days.workingDayOnOrAfter(today);
    return [
      {
        key: `${source.kind === 'offer' ? 'oferta' : 'zaplata'}-${source.id}`,
        date,
        title: `Zadzwoń: ${reminderLabel(source)}`,
        description: describe(source, appUrl),
      },
    ];
  });
}

function describe(source: ReminderSource, appUrl: string): string {
  const card =
    source.kind === 'offer'
      ? `${appUrl}/oferty?oferta=${source.id}`
      : `${appUrl}/niezaplacone?zlecenie=${source.id}`;
  return [
    `Przypomnienie z ZGE Menedżera: ${reminderLabel(source)}.`,
    `Szczegóły (działa na komputerze w biurze): ${card}`,
    'Po telefonie odznacz to w aplikacji, a wydarzenie zniknie z kalendarza.',
  ].join('\n');
}
