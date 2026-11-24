import type { PlannedReminder } from './reminder-plan.js';

/**
 * Co aplikacja robi w Kalendarzu Google. Prawdziwa wersja: GoogleCalendarApi (REST),
 * w testach atrapa, więc testy nigdy nie łączą się z Google.
 */
export interface CalendarApi {
  /** Zakłada osobny kalendarz i zwraca jego numer w Google. */
  createCalendar(name: string): Promise<string>;
  /** Dodaje wydarzenie całodniowe i zwraca jego numer w Google. */
  insertEvent(calendarId: string, reminder: PlannedReminder): Promise<string>;
  updateEvent(calendarId: string, eventId: string, reminder: PlannedReminder): Promise<void>;
  deleteEvent(calendarId: string, eventId: string): Promise<void>;
}

/** offline = brak internetu; unauthorized = brak/wygasłe połączenie z kontem; not_found = nie ma już w Google. */
export type CalendarErrorKind = 'offline' | 'unauthorized' | 'not_found' | 'other';

const MESSAGES: Record<CalendarErrorKind, string> = {
  offline:
    'Brak połączenia z internetem. Przypomnienia w Kalendarzu Google zaktualizują się same, gdy internet wróci.',
  unauthorized:
    'Połączenie z Kalendarzem Google wygasło albo zostało cofnięte. W Ustawieniach kliknij „Połącz z Kalendarzem Google”.',
  not_found: 'Nie znaleziono kalendarza lub wydarzenia w Google.',
  other: 'Kalendarz Google odpowiedział błędem.',
};

/** Błąd rozmowy z Google z czytelnym komunikatem po polsku. */
export class CalendarApiError extends Error {
  constructor(
    readonly kind: CalendarErrorKind,
    detail = '',
  ) {
    super(detail ? `${MESSAGES[kind]} (${detail})` : MESSAGES[kind]);
    this.name = 'CalendarApiError';
  }
}
