import { describe, it, expect } from 'vitest';
import { googleCalendarLink } from '../../../src/modules/calendar/google-calendar-link.js';

const event = {
  title: 'Pomiar: Jan Przykładowy – Brzesko',
  date: '2026-11-30',
  location: 'Brzesko, dz. 123/4',
  details: 'Telefon: 600 100 200',
};

describe('googleCalendarLink (przycisk „Dodaj do Kalendarza Google”)', () => {
  it('opens the Google Calendar "new event" form', () => {
    const url = new URL(googleCalendarLink(event));
    expect(url.origin + url.pathname).toBe('https://calendar.google.com/calendar/render');
    expect(url.searchParams.get('action')).toBe('TEMPLATE');
  });

  it('fills in title, place and details (Polish letters kept)', () => {
    const url = new URL(googleCalendarLink(event));
    expect(url.searchParams.get('text')).toBe('Pomiar: Jan Przykładowy – Brzesko');
    expect(url.searchParams.get('location')).toBe('Brzesko, dz. 123/4');
    expect(url.searchParams.get('details')).toBe('Telefon: 600 100 200');
  });

  it('makes an all-day event on the measurement day (end = next day, as Google expects)', () => {
    expect(new URL(googleCalendarLink(event)).searchParams.get('dates')).toBe('20261130/20261201');
  });

  it('handles the end of a year', () => {
    const url = new URL(googleCalendarLink({ ...event, date: '2026-12-31' }));
    expect(url.searchParams.get('dates')).toBe('20261231/20270101');
  });

  it('rejects a wrong date', () => {
    expect(() => googleCalendarLink({ ...event, date: '2026-02-30' })).toThrow(/Nieprawidłowa data/);
  });
});
