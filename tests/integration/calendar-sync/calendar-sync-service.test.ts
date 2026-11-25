import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { AppDatabase } from '../../../src/db.js';
import { CalendarSyncService } from '../../../src/modules/calendar-sync/calendar-sync-service.js';
import { CalendarApiError } from '../../../src/modules/calendar-sync/calendar-api.js';
import type { ReminderSource } from '../../../src/modules/calendar-sync/reminder-plan.js';
import { FakeCalendar } from './fake-calendar.js';
import { UrgencyRules, DEFAULT_URGENCY_SETTINGS } from '../../../src/modules/urgency/urgency-rules.js';

describe('CalendarSyncService: przypomnienia „Zadzwoń” w Kalendarzu Google', () => {
  let dir: string;
  let db: AppDatabase;
  let api: FakeCalendar;
  let sources: ReminderSource[];
  let today: string;
  let connected: boolean;
  let service: CalendarSyncService;

  const make = (opts: { configured?: boolean } = {}) =>
    new CalendarSyncService({
      db,
      api: opts.configured === false ? null : api,
      isConnected: () => connected,
      sources: () => sources,
      days: new UrgencyRules(DEFAULT_URGENCY_SETTINGS),
      today: () => today,
      now: () => new Date('2026-11-16T09:30:00Z'),
      appUrl: 'http://localhost:3000',
    });

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'zge-'));
    db = AppDatabase.open(path.join(dir, 'zge.db'));
    db.migrate();
    api = new FakeCalendar();
    sources = [{ kind: 'offer', id: 12, lastContactOn: '2026-11-16', limitDays: 7 }];
    today = '2026-11-16';
    connected = true;
    service = make();
  });

  afterEach(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('is off by default: nothing goes to Google', async () => {
    const result = await service.syncNow();
    expect(service.status().enabled).toBe(false);
    expect(result.ok).toBe(true);
    expect(api.calls).toEqual([]);
  });

  it('when enabled, creates the „ZGE przypomnienia” calendar once and the event', async () => {
    service.setEnabled(true, 'Łukasz');
    await service.syncNow();
    await service.syncNow();
    expect(api.calendars).toEqual(['ZGE przypomnienia']);
    expect(api.titles()).toEqual(['Zadzwoń: oferta nr 12 @ 2026-11-25']);
    expect(service.status()).toMatchObject({
      eventCount: 1,
      lastError: null,
      lastOkAt: '2026-11-16T09:30:00.000Z',
    });
  });

  it('does not call Google again when nothing changed', async () => {
    service.setEnabled(true, 'Łukasz');
    await service.syncNow();
    api.calls = [];
    await service.syncNow();
    expect(api.calls).toEqual([]);
  });

  it('ticked off (offer closed / paid): the event is deleted', async () => {
    service.setEnabled(true, 'Łukasz');
    await service.syncNow();
    sources = [];
    await service.syncNow();
    expect(api.titles()).toEqual([]);
    expect(service.status().eventCount).toBe(0);
  });

  it('call recorded („przypomnij znów”): the event moves to the new date', async () => {
    service.setEnabled(true, 'Łukasz');
    await service.syncNow();
    sources = [{ kind: 'offer', id: 12, lastContactOn: '2026-11-25', limitDays: 7 }];
    today = '2026-11-25';
    await service.syncNow();
    expect(api.titles()).toEqual(['Zadzwoń: oferta nr 12 @ 2026-12-04']);
    expect(api.events.size).toBe(1);
  });

  it('overdue and not ticked off: moved to the next working day, still visible', async () => {
    service.setEnabled(true, 'Łukasz');
    await service.syncNow();
    today = '2026-11-28'; // sobota po terminie 25.11
    await service.syncNow();
    expect(api.titles()).toEqual(['Zadzwoń: oferta nr 12 @ 2026-11-30']);
  });

  it('event deleted by hand in Google: created again', async () => {
    service.setEnabled(true, 'Łukasz');
    await service.syncNow();
    api.events.clear();
    today = '2026-11-27';
    await service.syncNow();
    expect(api.titles()).toEqual(['Zadzwoń: oferta nr 12 @ 2026-11-27']);
  });

  it('event already gone in Google when closing: treated as done, no error', async () => {
    service.setEnabled(true, 'Łukasz');
    await service.syncNow();
    api.events.clear();
    sources = [];
    const result = await service.syncNow();
    expect(result.ok).toBe(true);
    expect(service.status().eventCount).toBe(0);
  });

  it('calendar deleted by hand in Google: next sync creates it again', async () => {
    service.setEnabled(true, 'Łukasz');
    await service.syncNow();
    api.calendars = [];
    api.events.clear();
    sources.push({ kind: 'payment', id: 34, lastContactOn: '2026-11-16', limitDays: 14 });
    const first = await service.syncNow();
    expect(first.ok).toBe(false);
    await service.syncNow();
    expect(api.calendars).toEqual(['ZGE przypomnienia']);
    expect(api.titles()).toEqual([
      'Zadzwoń: oferta nr 12 @ 2026-11-25',
      'Zadzwoń: zapłata, zlecenie nr 34 @ 2026-12-04',
    ]);
  });

  it('no internet: no exception, clear message kept until the next successful sync', async () => {
    service.setEnabled(true, 'Łukasz');
    api.failWith = new CalendarApiError('offline');
    const result = await service.syncNow();
    expect(result.ok).toBe(false);
    expect(service.status().lastError).toMatch(/Brak połączenia z internetem/);
    api.failWith = null;
    await service.syncNow();
    expect(service.status().lastError).toBeNull();
    expect(api.titles()).toHaveLength(1);
  });

  it('expired token: message tells what to click', async () => {
    service.setEnabled(true, 'Łukasz');
    api.failWith = new CalendarApiError('unauthorized');
    await service.syncNow();
    expect(service.status().lastError).toMatch(/Połącz z Kalendarzem Google/);
  });

  it('unexpected error is reported, not swallowed', async () => {
    service.setEnabled(true, 'Łukasz');
    api.insertEvent = async () => {
      throw new Error('coś dziwnego');
    };
    const result = await service.syncNow();
    expect(result.ok).toBe(false);
    expect(service.status().lastError).toMatch(/coś dziwnego/);
  });

  it('enabled but not connected to a Google account: message, no calls', async () => {
    connected = false;
    service.setEnabled(true, 'Łukasz');
    await service.syncNow();
    expect(api.calls).toEqual([]);
    expect(service.status().lastError).toMatch(/Połącz z Kalendarzem Google/);
  });

  it('enabled but Google keys missing in .env: message, no calls', async () => {
    service = make({ configured: false });
    service.setEnabled(true, 'Łukasz');
    await service.syncNow();
    expect(service.status()).toMatchObject({ configured: false });
    expect(service.status().lastError).toMatch(/GOOGLE_CLIENT_ID/);
  });

  it('turning it off removes the reminders it created', async () => {
    service.setEnabled(true, 'Łukasz');
    await service.syncNow();
    service.setEnabled(false, 'Bartek');
    await service.syncNow();
    expect(api.titles()).toEqual([]);
    expect(service.status().lastError).toBeNull();
  });

  it('history: who turned it on and off, newest first', () => {
    service.setEnabled(true, 'Łukasz');
    service.setEnabled(true, 'Łukasz'); // bez zmiany: bez wpisu
    service.setEnabled(false, 'Bartek');
    expect(service.status().history).toEqual([
      { happenedOn: '2026-11-16', person: 'Bartek', action: 'disabled' },
      { happenedOn: '2026-11-16', person: 'Łukasz', action: 'enabled' },
    ]);
  });

  it('requires a person to switch it on', () => {
    expect(() => service.setEnabled(true, '  ')).toThrow();
  });

  it('two syncs at the same time do not create duplicate events', async () => {
    service.setEnabled(true, 'Łukasz');
    await Promise.all([service.syncNow(), service.syncNow()]);
    expect(api.events.size).toBe(1);
    expect(api.calendars).toHaveLength(1);
  });
});
