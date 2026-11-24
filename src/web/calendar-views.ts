import { html, type SafeHtml } from './html.js';
import { formatDate } from './view-helpers.js';
import { googleCalendarLink, type CalendarEvent } from '../modules/calendar/google-calendar-link.js';

/**
 * Przycisk „Dodaj przypomnienie do Kalendarza Google” (oferta, zapłata). Zwykły link: otwiera w nowej karcie
 * gotowy formularz Google, użytkownik sam klika „Zapisz”. To NIE jest automatyczna synchronizacja:
 * nic nie jest wysyłane, dopóki ktoś nie kliknie, a późniejsze zmiany w aplikacji nie zmieniają wydarzenia.
 */
export function reminderButton(event: CalendarEvent, dayLabel: string): SafeHtml {
  return html`<p class="reminder">
    <a class="button secondary small" href="${googleCalendarLink(event)}" target="_blank" rel="noopener"
      ><span aria-hidden="true">📅</span> Dodaj przypomnienie do Kalendarza Google</a
    >
    <small>${dayLabel}: ${formatDate(event.date)}</small>
  </p>`;
}
