import { describe, it, expect } from 'vitest';
import { GoogleCalendarApi } from '../../../src/modules/calendar-sync/google-calendar-api.js';
import { CalendarApiError } from '../../../src/modules/calendar-sync/calendar-api.js';
import type { PlannedReminder } from '../../../src/modules/calendar-sync/reminder-plan.js';

interface Call {
  url: string;
  method: string;
  auth: string | null;
  body: unknown;
}

/** Atrapa fetch: zapisuje zapytania i odpowiada podanym statusem. */
function fakeFetch(status: number, json: unknown = {}) {
  const calls: Call[] = [];
  const fn = (async (url: string, init: RequestInit = {}) => {
    const headers = new Headers(init.headers);
    calls.push({
      url,
      method: init.method ?? 'GET',
      auth: headers.get('authorization'),
      body: init.body ? JSON.parse(String(init.body)) : null,
    });
    return new Response(status === 204 ? null : JSON.stringify(json), { status });
  }) as typeof fetch;
  return { fn, calls };
}

const reminder: PlannedReminder = {
  key: 'oferta-12',
  date: '2026-12-31',
  title: 'Zadzwoń: oferta nr 12',
  description: 'opis',
};
const token = async () => 'tok-1';
const BASE = 'https://www.googleapis.com/calendar/v3';

describe('GoogleCalendarApi: zapytania do oficjalnego REST API Kalendarza Google', () => {
  it('creates a secondary calendar in the Warsaw time zone', async () => {
    const f = fakeFetch(200, { id: 'abc@group.calendar.google.com' });
    const id = await new GoogleCalendarApi(f.fn, token).createCalendar('ZGE przypomnienia');
    expect(id).toBe('abc@group.calendar.google.com');
    expect(f.calls[0]).toMatchObject({
      url: `${BASE}/calendars`,
      method: 'POST',
      auth: 'Bearer tok-1',
      body: { summary: 'ZGE przypomnienia', timeZone: 'Europe/Warsaw' },
    });
  });

  it('inserts an all-day event (end date = next day, exclusive), free time, default reminders', async () => {
    const f = fakeFetch(200, { id: 'ev1' });
    const id = await new GoogleCalendarApi(f.fn, token).insertEvent('a@b', reminder);
    expect(id).toBe('ev1');
    expect(f.calls[0]).toMatchObject({
      url: `${BASE}/calendars/a%40b/events`,
      method: 'POST',
      body: {
        summary: 'Zadzwoń: oferta nr 12',
        description: 'opis',
        start: { date: '2026-12-31' },
        end: { date: '2027-01-01' },
        transparency: 'transparent',
        reminders: { useDefault: true },
        extendedProperties: { private: { zgeKey: 'oferta-12' } },
      },
    });
  });

  it('updates with PATCH and deletes with DELETE', async () => {
    const f = fakeFetch(200, { id: 'ev1' });
    const api = new GoogleCalendarApi(f.fn, token);
    await api.updateEvent('cal', 'ev 1', reminder);
    const d = fakeFetch(204);
    await new GoogleCalendarApi(d.fn, token).deleteEvent('cal', 'ev1');
    expect(f.calls[0]).toMatchObject({ url: `${BASE}/calendars/cal/events/ev%201`, method: 'PATCH' });
    expect(d.calls[0]).toMatchObject({
      url: `${BASE}/calendars/cal/events/ev1`,
      method: 'DELETE',
      body: null,
    });
  });

  it.each([
    [401, 'unauthorized'],
    [404, 'not_found'],
    [410, 'not_found'],
    [500, 'other'],
    [403, 'other'],
  ])('HTTP %i → error kind %s', async (status, kind) => {
    const f = fakeFetch(status, { error: { message: 'x' } });
    const err = await new GoogleCalendarApi(f.fn, token).deleteEvent('c', 'e').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CalendarApiError);
    expect((err as CalendarApiError).kind).toBe(kind);
  });

  it('other errors include the HTTP code in the message', async () => {
    const f = fakeFetch(500);
    await expect(new GoogleCalendarApi(f.fn, token).createCalendar('x')).rejects.toThrow(/kod 500/);
  });

  it('no internet (fetch fails) → offline', async () => {
    const offline = (async () => {
      throw new TypeError('fetch failed');
    }) as typeof fetch;
    const err = await new GoogleCalendarApi(offline, token).createCalendar('x').catch((e: unknown) => e);
    expect((err as CalendarApiError).kind).toBe('offline');
  });

  it('a response without an id is an error, not a silent success', async () => {
    const f = fakeFetch(200, {});
    await expect(new GoogleCalendarApi(f.fn, token).insertEvent('c', reminder)).rejects.toThrow(
      CalendarApiError,
    );
  });
});
