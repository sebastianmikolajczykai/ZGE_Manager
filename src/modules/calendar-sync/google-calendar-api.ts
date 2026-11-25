import { CalendarApiError, type CalendarApi } from './calendar-api.js';
import type { PlannedReminder } from './reminder-plan.js';

/** Oficjalne REST API Kalendarza Google v3 (https://developers.google.com/workspace/calendar/api/v3/reference). */
const API_BASE = 'https://www.googleapis.com/calendar/v3';
const TIME_ZONE = 'Europe/Warsaw';

const HTTP_UNAUTHORIZED = 401;
const HTTP_NOT_FOUND = 404;
const HTTP_GONE = 410;

/**
 * Kalendarz Google przez zwykłe zapytania HTTPS (wbudowany fetch, bez dodatkowych bibliotek).
 * Token dostępu daje GoogleOAuth (sam go odświeża).
 */
export class GoogleCalendarApi implements CalendarApi {
  constructor(
    private readonly fetchFn: typeof fetch,
    private readonly accessToken: () => Promise<string>,
  ) {}

  async createCalendar(name: string): Promise<string> {
    return idOf(await this.request('POST', '/calendars', { summary: name, timeZone: TIME_ZONE }));
  }

  async insertEvent(calendarId: string, reminder: PlannedReminder): Promise<string> {
    return idOf(await this.request('POST', `/calendars/${enc(calendarId)}/events`, eventBody(reminder)));
  }

  async updateEvent(calendarId: string, eventId: string, reminder: PlannedReminder): Promise<void> {
    await this.request('PATCH', `/calendars/${enc(calendarId)}/events/${enc(eventId)}`, eventBody(reminder));
  }

  async deleteEvent(calendarId: string, eventId: string): Promise<void> {
    await this.request('DELETE', `/calendars/${enc(calendarId)}/events/${enc(eventId)}`);
  }

  private async request(method: string, path: string, body?: object): Promise<unknown> {
    const headers: Record<string, string> = { authorization: `Bearer ${await this.accessToken()}` };
    if (body) headers['content-type'] = 'application/json';
    let response: Response;
    try {
      response = await this.fetchFn(`${API_BASE}${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw new CalendarApiError('offline');
    }
    if (response.ok) return response.status === 204 ? null : response.json();
    if (response.status === HTTP_UNAUTHORIZED) throw new CalendarApiError('unauthorized');
    if (response.status === HTTP_NOT_FOUND || response.status === HTTP_GONE) {
      throw new CalendarApiError('not_found');
    }
    throw new CalendarApiError('other', `kod ${response.status}`);
  }
}

/** Wydarzenie całodniowe; „transparent” = nie blokuje czasu w kalendarzu. Koniec to następny dzień (wyłącznie). */
function eventBody(r: PlannedReminder): object {
  return {
    summary: r.title,
    description: r.description,
    start: { date: r.date },
    end: { date: nextDay(r.date) },
    transparency: 'transparent',
    reminders: { useDefault: true },
    extendedProperties: { private: { zgeKey: r.key } },
  };
}

function idOf(json: unknown): string {
  const id = (json as { id?: unknown } | null)?.id;
  if (typeof id !== 'string' || id === '') throw new CalendarApiError('other', 'brak numeru w odpowiedzi');
  return id;
}

function enc(part: string): string {
  return encodeURIComponent(part);
}

function nextDay(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
