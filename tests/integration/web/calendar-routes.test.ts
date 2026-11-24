import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NUDGE_DELAY_MS } from '../../../src/modules/calendar-sync/calendar-sync-scheduler.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { AppDatabase } from '../../../src/db.js';
import { buildApp } from '../../../src/app.js';
import { WorkTypeRepository } from '../../../src/modules/work-types/work-type-repository.js';
import { CalendarApiError } from '../../../src/modules/calendar-sync/calendar-api.js';
import type { CalendarAccount } from '../../../src/web/calendar-routes.js';
import { FakeCalendar } from '../calendar-sync/fake-calendar.js';

const FORM = { 'content-type': 'application/x-www-form-urlencoded' };

/** Atrapa konta Google: bez prawdziwego logowania. */
class FakeAccount implements CalendarAccount {
  connected = false;
  finished: string[] = [];
  finishError: Error | null = null;
  startAuthorization(): string {
    return 'https://accounts.google.com/o/oauth2/v2/auth?test=1';
  }
  async finishAuthorization(code: string, state: string): Promise<void> {
    if (this.finishError) throw this.finishError;
    this.finished.push(`${code}/${state}`);
    this.connected = true;
  }
  async disconnect(): Promise<void> {
    this.connected = false;
  }
  isConnected(): boolean {
    return this.connected;
  }
}

describe('Ustawienia → Kalendarz Google (ekran)', () => {
  let dir: string;
  let db: AppDatabase;
  let app: FastifyInstance;
  let api: FakeCalendar;
  let account: FakeAccount;

  const start = (configured = true) =>
    buildApp({
      db,
      today: () => '2026-11-16',
      defaultPeople: ['Anna', 'Piotr'],
      calendar: configured ? { api, account } : undefined,
    });

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'zge-'));
    db = AppDatabase.open(path.join(dir, 'zge.db'));
    db.migrate();
    api = new FakeCalendar();
    account = new FakeAccount();
    app = start();
  });

  afterEach(async () => {
    await app.close();
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  const post = (url: string, fields: Record<string, string> = {}) =>
    app.inject({ method: 'POST', url, headers: FORM, payload: new URLSearchParams(fields).toString() });
  const settings = async () => (await app.inject({ method: 'GET', url: '/ustawienia' })).body;
  const createOffer = () =>
    post('/oferty', {
      clientName: 'Ewa Ofertowa',
      phone: '600 100 200',
      workTypeId: '1',
      sentOn: '2026-11-16',
      town: 'Przykładowo',
      pricePln: '2 800',
      person: 'Anna',
    });

  it('settings show the section, off by default, with the privacy note', async () => {
    const body = await settings();
    expect(body).toContain('id="kalendarz"');
    expect(body).toContain('href="#kalendarz"');
    expect(body).toContain('Synchronizacja: wyłączona');
    expect(body).toMatch(/bez imienia i nazwiska,\s+telefonu\s+i\s+kwoty/);
    expect(body).toContain('Konto Google: niepołączone');
  });

  it('without Google keys in .env: explains it and offers no connect button', async () => {
    await app.close();
    app = start(false);
    const body = await settings();
    expect(body).toContain('GOOGLE_CLIENT_ID');
    expect(body).not.toContain('Połącz z Kalendarzem Google:');
    const res = await post('/kalendarz-google/polacz', { person: 'Anna' });
    expect(res.statusCode).toBe(400);
  });

  it('connect: sends the browser to the Google consent page', async () => {
    const res = await post('/kalendarz-google/polacz', { person: 'Anna' });
    expect(res.statusCode).toBe(303);
    expect(res.headers.location).toBe('https://accounts.google.com/o/oauth2/v2/auth?test=1');
  });

  it('return from Google: finishes login, writes history, shows connected', async () => {
    await post('/kalendarz-google/polacz', { person: 'Anna' });
    const back = await app.inject({ method: 'GET', url: '/kalendarz-google/oauth?code=c1&state=s1' });
    expect(back.statusCode).toBe(303);
    expect(back.headers.location).toBe('/ustawienia#kalendarz');
    expect(account.finished).toEqual(['c1/s1']);
    const body = await settings();
    expect(body).toContain('Konto Google: połączone');
    expect(body).toContain('Anna: połączono konto Google');
  });

  it('Google login cancelled: clear message, nothing connected', async () => {
    const back = await app.inject({ method: 'GET', url: '/kalendarz-google/oauth?error=access_denied' });
    expect(back.statusCode).toBe(400);
    expect(back.body).toContain('Nie połączono z Kalendarzem Google');
    expect(account.connected).toBe(false);
  });

  it('login error from the account is shown on the settings page', async () => {
    account.finishError = new Error('Link logowania jest nieaktualny. Spróbuj połączyć jeszcze raz.');
    const back = await app.inject({ method: 'GET', url: '/kalendarz-google/oauth?code=c&state=x' });
    expect(back.statusCode).toBe(400);
    expect(back.body).toContain('Link logowania jest nieaktualny');
  });

  it('turn on + sync now: reminder created in Google, count shown', async () => {
    account.connected = true;
    await createOffer();
    await post('/kalendarz-google/wlacz', { person: 'Anna', on: '1' });
    const res = await post('/kalendarz-google/synchronizuj');
    expect(res.statusCode).toBe(303);
    expect(api.titles()).toEqual(['Zadzwoń: oferta nr 1 @ 2026-11-25']);
    const body = await settings();
    expect(body).toContain('Synchronizacja: włączona');
    expect(body).toContain('W kalendarzu: 1');
    expect(body).toContain('Anna: włączono synchronizację');
  });

  it('nothing about the client goes to Google (name, phone, price)', async () => {
    account.connected = true;
    await createOffer();
    await post('/kalendarz-google/wlacz', { person: 'Anna', on: '1' });
    await post('/kalendarz-google/synchronizuj');
    const sent = JSON.stringify([...api.events.values()]);
    expect(sent).not.toMatch(/Ewa|Ofertowa|600 100 200|2800|2 800|Przykładowo/);
  });

  it('sync failing (no internet): red notice on every page, app still works', async () => {
    account.connected = true;
    await createOffer();
    api.failWith = new CalendarApiError('offline');
    await post('/kalendarz-google/wlacz', { person: 'Anna', on: '1' });
    await post('/kalendarz-google/synchronizuj');
    const board = await app.inject({ method: 'GET', url: '/' });
    expect(board.statusCode).toBe(200);
    expect(board.body).toContain('Brak połączenia z internetem');
    expect(board.body).toContain('href="/ustawienia#kalendarz"');
  });

  it('no notice when sync is off', async () => {
    const board = await app.inject({ method: 'GET', url: '/' });
    expect(board.body).not.toContain('calendar-banner');
  });

  it('turn off and disconnect: history and status', async () => {
    account.connected = true;
    await post('/kalendarz-google/wlacz', { person: 'Anna', on: '1' });
    await post('/kalendarz-google/wlacz', { person: 'Piotr', on: '0' });
    const res = await post('/kalendarz-google/odlacz', { person: 'Piotr' });
    expect(res.statusCode).toBe(303);
    const body = await settings();
    expect(account.connected).toBe(false);
    expect(body).toContain('Piotr: wyłączono synchronizację');
    expect(body).toContain('Piotr: odłączono konto Google');
  });

  it('unpaid order: reminder „zapłata, zlecenie nr N”; marked paid → removed', async () => {
    account.connected = true;
    const workTypeId = new WorkTypeRepository(db).create({
      name: 'Test zapłaty',
      steps: [
        { name: 'Oddanie', kind: 'own', limitDays: 2, provisional: false },
        { name: 'Zapłata', kind: 'waiting', limitDays: 3, provisional: false, payment: true },
      ],
    });
    const created = await post('/zlecenia', {
      clientName: 'Jan Przykładowy',
      phone: '600 100 200',
      town: 'Przykładowo',
      workTypeId: String(workTypeId),
      person: 'Anna',
    });
    const orderId = Number(String(created.headers.location).split('zlecenie=')[1]);
    await post(`/zlecenia/${orderId}/kroki/1/zrobione`, { person: 'Anna' });
    await post('/kalendarz-google/wlacz', { person: 'Anna', on: '1' });
    await post('/kalendarz-google/synchronizuj');
    expect(api.titles()).toEqual([`Zadzwoń: zapłata, zlecenie nr ${orderId} @ 2026-11-19`]);

    await post(`/niezaplacone/${orderId}/zaplacone`, { person: 'Anna' });
    await post('/kalendarz-google/synchronizuj');
    expect(api.titles()).toEqual([]);
  });

  it('switching requires a person', async () => {
    const res = await post('/kalendarz-google/wlacz', { on: '1' });
    expect(res.statusCode).toBe(400);
  });
});

describe('Synchronizacja w tle (calendarAutoSync)', () => {
  it('syncs at start and shortly after a click that saves something', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    const dir = mkdtempSync(path.join(tmpdir(), 'zge-'));
    const db = AppDatabase.open(path.join(dir, 'zge.db'));
    db.migrate();
    const api = new FakeCalendar();
    const account = new FakeAccount();
    account.connected = true;
    const app = buildApp({
      db,
      today: () => '2026-11-16',
      defaultPeople: ['Anna'],
      calendar: { api, account },
      calendarAutoSync: true,
    });
    try {
      const post = (url: string, fields: Record<string, string>) =>
        app.inject({ method: 'POST', url, headers: FORM, payload: new URLSearchParams(fields).toString() });
      await post('/kalendarz-google/wlacz', { person: 'Anna', on: '1' });
      await vi.waitFor(() => expect(api.calls).toEqual([])); // brak spraw = brak zapytań do Google
      await post('/oferty', {
        clientName: 'Ewa Ofertowa',
        phone: '600 100 200',
        workTypeId: '1',
        sentOn: '2026-11-16',
        town: 'Przykładowo',
        person: 'Anna',
      });
      await vi.advanceTimersByTimeAsync(NUDGE_DELAY_MS);
      await vi.waitFor(() => expect(api.events.size).toBe(1));
    } finally {
      await app.close();
      db.close();
      rmSync(dir, { recursive: true, force: true });
      vi.useRealTimers();
    }
  });
});
