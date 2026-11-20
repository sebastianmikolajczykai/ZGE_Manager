import { DayCounter, type LocalDate } from '../urgency/day-counter.js';

/**
 * Link „Dodaj do Kalendarza Google”: otwiera w przeglądarce gotowy formularz nowego wydarzenia,
 * a użytkownik sam klika „Zapisz” na swoim koncie Google. Bez kluczy API i bez logowania w aplikacji.
 * Dane wydarzenia trafiają do Google dopiero po kliknięciu linku.
 */
export interface CalendarEvent {
  title: string;
  /** Dzień wydarzenia (całodniowego). */
  date: LocalDate;
  location: string;
  details: string;
}

const GOOGLE_NEW_EVENT_URL = 'https://calendar.google.com/calendar/render';
const calendar = new DayCounter('calendar');

export function googleCalendarLink(event: CalendarEvent): string {
  calendar.daysBetween(event.date, event.date); // sprawdza poprawność daty
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title,
    // Wydarzenie całodniowe: Google oczekuje daty końca jako następnego dnia.
    dates: `${compact(event.date)}/${compact(nextDay(event.date))}`,
    location: event.location,
    details: event.details,
  });
  return `${GOOGLE_NEW_EVENT_URL}?${params.toString()}`;
}

function compact(date: LocalDate): string {
  return date.replaceAll('-', '');
}

function nextDay(date: LocalDate): LocalDate {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
