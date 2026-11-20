import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { AppDatabase } from '../../../src/db.js';
import { buildApp } from '../../../src/app.js';

const FORM = { 'content-type': 'application/x-www-form-urlencoded' };

const THRESHOLDS = {
  yellowAfterIdleDays: '2',
  redAfterIdleDays: '3',
  warnDaysBeforeLimit: '1',
  blinkEnabled: '1',
  confirmActions: '1',
  blinkAfterRedDays: '7',
  offerFollowUpDays: '7',
  refreshSeconds: '60',
};

describe('Ustawienia: kolory i przypomnienia (ekran)', () => {
  let dir: string;
  let db: AppDatabase;
  let app: FastifyInstance;
  let today: string;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'zge-'));
    db = AppDatabase.open(path.join(dir, 'zge.db'));
    db.migrate();
    today = '2026-11-16'; // poniedziałek
    app = buildApp({ db, today: () => today, defaultPeople: ['Anna', 'Piotr'] });
  });

  afterEach(async () => {
    await app.close();
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  const post = (url: string, fields: Record<string, string>) =>
    app.inject({ method: 'POST', url, headers: FORM, payload: new URLSearchParams(fields).toString() });
  const saveThresholds = (change: Record<string, string>, person = 'Anna') =>
    post('/ustawienia/progi', { ...THRESHOLDS, ...change, person });
  const settingsPage = async () => (await app.inject({ method: 'GET', url: '/ustawienia' })).body;

  it('has a short menu jumping to each settings section', async () => {
    const page = await settingsPage();
    for (const [id, name] of [
      ['kolory', 'Kolory i przypomnienia'],
      ['rodzaje-prac', 'Rodzaje prac'],
      ['dni-wolne', 'Dni wolne firmy'],
      ['osoby', 'Osoby'],
    ]) {
      expect(page).toContain(`href="#${id}"`);
      expect(page).toMatch(new RegExp(`<h3 id="${id}">${name}`));
    }
  });

  it('shows the current values in editable fields with "Zapisz: osoba" buttons', async () => {
    const page = await settingsPage();
    expect(page).toContain('Kolory i przypomnienia');
    expect(page).toMatch(/name="redAfterIdleDays"[^>]*value="3"/);
    expect(page).toMatch(/name="blinkEnabled"[^>]*checked/);
    expect(page).toMatch(/name="confirmActions"[^>]*checked/);
    expect(page).toContain('Zapisz: Anna');
  });

  it('the "Czy na pewno?" window is on by default and can be switched off in Ustawienia', async () => {
    expect((await app.inject({ method: 'GET', url: '/' })).body).toContain('<dialog id="potwierdz"');
    await saveThresholds({ confirmActions: '' });
    expect((await app.inject({ method: 'GET', url: '/' })).body).not.toContain('<dialog id="potwierdz"');
  });

  it('saves a change, shows the new value and logs who changed it', async () => {
    const res = await saveThresholds({ redAfterIdleDays: '4' }, 'Piotr');
    expect(res.statusCode).toBe(303);
    expect(res.headers.location).toBe('/ustawienia');
    const page = await settingsPage();
    expect(page).toMatch(/name="redAfterIdleDays"[^>]*value="4"/);
    expect(page).toContain('Piotr: „Czerwone, gdy brak ruchu przez” 3 → 4');
  });

  it('a wrong value shows a readable error and keeps what was typed', async () => {
    const res = await saveThresholds({ yellowAfterIdleDays: '5', redAfterIdleDays: '4' });
    expect(res.statusCode).toBe(400);
    expect(res.body).toMatch(/role="alert"[^>]*>Czerwone musi przyjść później niż żółte/);
    expect(res.body).toMatch(/name="yellowAfterIdleDays"[^>]*value="5"/);
  });

  it('the board colours follow the new settings at once', async () => {
    await post('/zlecenia', {
      clientName: 'Jan Przykładowy',
      phone: '600 100 200',
      town: 'Przykładowo',
      workTypeId: '1',
      measurementOn: '2026-11-30',
      person: 'Anna',
    });
    today = '2026-11-17'; // dzień przed limitem 2 dni pierwszego kroku → żółte
    const rowOf = async () =>
      (await app.inject({ method: 'GET', url: '/' })).body.match(/<tr\s+class="([^"]*)"/)?.[1];
    expect(await rowOf()).toContain('c-yellow');
    await saveThresholds({ warnDaysBeforeLimit: '0' });
    expect(await rowOf()).toContain('c-green');
  });

  it('the auto-refresh uses the interval from settings', async () => {
    await saveThresholds({ refreshSeconds: '120' });
    expect(await settingsPage()).toContain('120000');
  });

  it('the offer card offers the reminder period from settings', async () => {
    await saveThresholds({ offerFollowUpDays: '10' });
    await post('/oferty', {
      clientName: 'Ewa Ofertowa',
      phone: '600 100 200',
      workTypeId: '1',
      sentOn: '2026-11-16',
      person: 'Anna',
    });
    const card = await app.inject({ method: 'GET', url: '/oferty?oferta=1' });
    expect(card.body).toMatch(/Przypomnij znów za 10 dni\s+roboczych/);
  });

  it('"Przywróć domyślne" puts the agreed values back', async () => {
    await saveThresholds({ redAfterIdleDays: '6' });
    const res = await post('/ustawienia/progi/domyslne', { person: 'Piotr' });
    expect(res.statusCode).toBe(303);
    const page = await settingsPage();
    expect(page).toMatch(/name="redAfterIdleDays"[^>]*value="3"/);
    expect(page).toContain('Piotr: „Czerwone, gdy brak ruchu przez” 6 → 3');
  });

  it('saving without choosing a person is refused', async () => {
    const res = await post('/ustawienia/progi', { ...THRESHOLDS, redAfterIdleDays: '5' });
    expect(res.statusCode).toBe(400);
    expect(res.body).toContain('Wybierz, kto');
  });

  describe('Dni wolne firmy', () => {
    const addDaysOff = (fields: Record<string, string>) =>
      post('/ustawienia/dni-wolne', { fromOn: '', toOn: '', note: '', person: 'Anna', ...fields });

    it('adds a period that shows in the list with the reason and who added it', async () => {
      const res = await addDaysOff({ fromOn: '2026-12-28', toOn: '2026-12-31', note: 'urlop' });
      expect(res.statusCode).toBe(303);
      const page = await settingsPage();
      expect(page).toContain('28.12.2026 – 31.12.2026');
      expect(page).toContain('urlop');
      expect(page).toContain('kto wpisał: Anna');
    });

    it('a day off is not counted on the board (limit moves by a day)', async () => {
      await post('/zlecenia', {
        clientName: 'Jan Przykładowy',
        phone: '600 100 200',
        town: 'Przykładowo',
        workTypeId: '1',
        measurementOn: '2026-11-30',
        person: 'Anna',
      });
      today = '2026-11-18'; // limit 2 dni od pn 16.11 → w środę czerwone
      const rowOf = async () =>
        (await app.inject({ method: 'GET', url: '/' })).body.match(/<tr\s+class="([^"]*)"/)?.[1];
      expect(await rowOf()).toContain('c-red');
      await addDaysOff({ fromOn: '2026-11-17' });
      expect(await rowOf()).toContain('c-yellow');
    });

    it('removes a period', async () => {
      await addDaysOff({ fromOn: '2026-12-28', note: 'do usunięcia' });
      const res = await post('/ustawienia/dni-wolne/1/usun', {});
      expect(res.statusCode).toBe(303);
      expect(await settingsPage()).not.toContain('do usunięcia');
    });

    it('a wrong period shows a readable error', async () => {
      const res = await addDaysOff({ fromOn: '2026-12-31', toOn: '2026-12-28' });
      expect(res.statusCode).toBe(400);
      expect(res.body).toContain('nie może być przed');
    });
  });
});
