import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { AppDatabase } from '../../../src/db.js';
import { buildApp } from '../../../src/app.js';

const FORM = { 'content-type': 'application/x-www-form-urlencoded' };

describe('web routes', () => {
  let dir: string;
  let db: AppDatabase;
  let app: FastifyInstance;
  let today: string;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'zge-'));
    db = AppDatabase.open(path.join(dir, 'zge.db'));
    db.migrate();
    today = '2026-11-16';
    app = buildApp({ db, today: () => today, defaultPeople: ['Anna', 'Piotr'] });
  });

  afterEach(async () => {
    await app.close();
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  const createOrder = (fields: Record<string, string> = {}) =>
    app.inject({
      method: 'POST',
      url: '/zlecenia',
      headers: FORM,
      payload: new URLSearchParams({
        clientName: 'Jan Przykładowy',
        phone: '600 100 200',
        town: 'Przykładowo',
        workTypeId: '1',
        measurementOn: '2026-11-30',
        person: 'Anna',
        ...fields,
      }).toString(),
    });

  describe('osoby w zleceniu i filtr „Moje”', () => {
    const post = (url: string, fields: Record<string, string>) =>
      app.inject({ method: 'POST', url, headers: FORM, payload: new URLSearchParams(fields).toString() });

    it('a new order can get a lead person; ?osoba= shows only that person’s orders', async () => {
      await createOrder({ clientName: 'Klient Anny', leadPerson: 'Anna' });
      await createOrder({ clientName: 'Klient bez osoby' });
      const mine = (await app.inject({ method: 'GET', url: '/?osoba=Anna' })).body;
      expect(mine).toContain('Klient Anny');
      expect(mine).not.toContain('Klient bez osoby');
      const all = (await app.inject({ method: 'GET', url: '/' })).body;
      expect(all).toContain('Klient bez osoby');
      expect(all).toContain('id="osoba"');
    });

    it('people can be planned on the card; the board follows the current step', async () => {
      const res = await createOrder({ clientName: 'Plan', leadPerson: 'Anna' });
      const id = /zlecenie=(\d+)/.exec(res.headers.location as string)?.[1];
      const saved = await post(`/zlecenia/${id}/osoby`, {
        leadPerson: 'Anna',
        step_1: 'Piotr',
        person: 'Anna',
      });
      expect(saved.statusCode).toBe(303);
      expect(saved.headers.location).toBe(`/?zlecenie=${id}`);
      expect((await app.inject({ method: 'GET', url: '/?osoba=Piotr' })).body).toContain('Plan');
      expect((await app.inject({ method: 'GET', url: '/?osoba=Anna' })).body).not.toContain('>Plan<');
      const card = (await app.inject({ method: 'GET', url: `/?zlecenie=${id}` })).body;
      expect(card).toContain('Anna: osoba do kroku „Ustalenie terminu pomiaru w terenie” (brak → Piotr)');
    });

    it('saving people without choosing who saves shows a readable error', async () => {
      const res = await createOrder();
      const id = /zlecenie=(\d+)/.exec(res.headers.location as string)?.[1];
      const bad = await post(`/zlecenia/${id}/osoby`, { leadPerson: 'Anna' });
      expect(bad.statusCode).toBe(400);
      expect(bad.body).toContain('Wybierz');
    });

    it('the new order form offers the lead person (optional)', async () => {
      const form = (await app.inject({ method: 'GET', url: '/zlecenia/nowe' })).body;
      expect(form).toMatch(/<select name="leadPerson">\s*<option value="">— nikt —/);
    });
  });

  it('board page lists the work type template and the people buttons', async () => {
    const res = await app.inject({ method: 'GET', url: '/zlecenia/nowe' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('Podział nieruchomości');
    expect(res.body).toContain('Anna');
  });

  it('?kolor=red shows only orders after the deadline; an unknown colour shows everything', async () => {
    await createOrder({ clientName: 'Stary Klient' });
    today = '2026-12-10';
    await createOrder({ clientName: 'Nowy Klient', measurementOn: '2026-12-30' });
    const red = (await app.inject({ method: 'GET', url: '/?kolor=red' })).body;
    expect(red).toContain('Stary Klient');
    expect(red).not.toContain('Nowy Klient');
    const all = (await app.inject({ method: 'GET', url: '/?kolor=fioletowy' })).body;
    expect(all).toContain('Stary Klient');
    expect(all).toContain('Nowy Klient');
  });

  it('Statystyki: menu tab, totals and the client from an order', async () => {
    await createOrder({ pricePln: '2 500' });
    const res = await app.inject({ method: 'GET', url: '/statystyki' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('href="/statystyki"');
    expect(res.body).toContain('Wszyscy klienci');
    expect(res.body).toContain('Jan Przykładowy');
    expect(res.body).toContain('listopad 2026');
  });

  it('creating an order redirects to the board with the order open', async () => {
    const res = await createOrder();
    expect(res.statusCode).toBe(303);
    expect(res.headers.location).toBe('/?zlecenie=1');
    const board = await app.inject({ method: 'GET', url: '/?zlecenie=1' });
    expect(board.body).toContain('Jan Przykładowy');
    expect(board.body).toContain('Ustalenie terminu pomiaru w terenie');
  });

  it('invalid data re-shows the form with a readable error and the typed values', async () => {
    const res = await createOrder({ phone: '123' });
    expect(res.statusCode).toBe(400);
    expect(res.body).toContain('Nieprawidłowy numer telefonu');
    expect(res.body).toContain('value="Jan Przykładowy"');
  });

  it('escapes HTML typed by users (no script injection)', async () => {
    await createOrder({ clientName: '<script>alert(1)</script>' });
    const board = await app.inject({ method: 'GET', url: '/' });
    expect(board.body).not.toContain('<script>alert(1)</script>');
    expect(board.body).toContain('&lt;script&gt;');
  });

  it('ticking a step and undoing it updates the order', async () => {
    await createOrder();
    const done = await app.inject({
      method: 'POST',
      url: '/zlecenia/1/kroki/1/zrobione',
      headers: FORM,
      payload: 'person=Piotr',
    });
    expect(done.statusCode).toBe(303);
    let page = await app.inject({ method: 'GET', url: '/?zlecenie=1' });
    expect(page.body).toContain('Analiza materiałów w urzędzie');
    expect(page.body).toMatch(/Piotr/);
    await app.inject({ method: 'POST', url: '/zlecenia/1/cofnij', headers: FORM, payload: 'person=Anna' });
    page = await app.inject({ method: 'GET', url: '/?zlecenie=1' });
    expect(page.body).toContain('cofnięcie');
  });

  it('refuses a form sent from another website (CSRF protection)', async () => {
    await createOrder();
    const res = await app.inject({
      method: 'POST',
      url: '/zlecenia/1/kroki/1/zrobione',
      headers: { ...FORM, origin: 'https://zla-strona.example', host: 'localhost:3000' },
      payload: 'person=Anna',
    });
    expect(res.statusCode).toBe(403);
  });

  it('an action on a step that is not active shows an error instead of crashing', async () => {
    await createOrder();
    const res = await app.inject({
      method: 'POST',
      url: '/zlecenia/1/kroki/5/zrobione',
      headers: FORM,
      payload: 'person=Anna',
    });
    expect(res.statusCode).toBe(400);
    expect(res.body).toContain('nie jest aktywny');
  });

  it('unknown order shows 404', async () => {
    const res = await app.inject({ method: 'GET', url: '/?zlecenie=999' });
    expect(res.statusCode).toBe(404);
  });

  it('settings: adds and removes a person', async () => {
    await app.inject({ method: 'POST', url: '/ustawienia/osoby', headers: FORM, payload: 'name=Ewa' });
    let page = await app.inject({ method: 'GET', url: '/ustawienia' });
    expect(page.body).toContain('Ewa');
    await app.inject({ method: 'POST', url: '/ustawienia/osoby/3/usun', headers: FORM, payload: '' });
    page = await app.inject({ method: 'GET', url: '/ustawienia' });
    expect(page.body).not.toContain('Ewa');
  });

  it('price typed with a comma and spaces is understood (2 500,50 → 2500,50 zł)', async () => {
    await createOrder({ pricePln: '2 500,50' });
    const page = await app.inject({ method: 'GET', url: '/?zlecenie=1' });
    expect(page.body).toContain('2500,50 zł');
  });

  it('daily step: "Sprawdzone dziś" is recorded and shown', async () => {
    await createOrder();
    for (const position of [1, 2, 3, 4]) {
      await app.inject({
        method: 'POST',
        url: `/zlecenia/1/kroki/${position}/zrobione`,
        headers: FORM,
        payload: 'person=Anna',
      });
    }
    let page = await app.inject({ method: 'GET', url: '/?zlecenie=1' });
    expect(page.body).toContain('Sprawdzone dziś: Piotr');
    await app.inject({
      method: 'POST',
      url: '/zlecenia/1/kroki/5/sprawdzone',
      headers: FORM,
      payload: 'person=Piotr',
    });
    page = await app.inject({ method: 'GET', url: '/?zlecenie=1' });
    expect(page.body).toContain('ostatnio sprawdzone 16.11.2026, Piotr');
  });

  it('a finished order disappears from the board but its card and history stay available', async () => {
    await createOrder();
    for (let position = 1; position <= 13; position++) {
      await app.inject({
        method: 'POST',
        url: `/zlecenia/1/kroki/${position}/zrobione`,
        headers: FORM,
        payload: 'person=Anna',
      });
    }
    const board = await app.inject({ method: 'GET', url: '/' });
    expect(board.body).toContain('Brak aktywnych zleceń');
    const card = await app.inject({ method: 'GET', url: '/?zlecenie=1' });
    expect(card.body).toContain('Zlecenie zakończone');
    expect(card.body).toContain('Anna: zrobione „Zapłata”');
  });

  it('settings: a duplicate person shows a readable error', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/ustawienia/osoby',
      headers: FORM,
      payload: 'name=anna',
    });
    expect(res.statusCode).toBe(400);
    expect(res.body).toContain('już jest na liście');
  });

  it('without any people the card asks to add them in settings', async () => {
    await createOrder();
    await app.inject({ method: 'POST', url: '/ustawienia/osoby/1/usun', headers: FORM, payload: '' });
    await app.inject({ method: 'POST', url: '/ustawienia/osoby/2/usun', headers: FORM, payload: '' });
    const page = await app.inject({ method: 'GET', url: '/?zlecenie=1' });
    expect(page.body).toContain('Dodaj osoby w Ustawieniach');
  });

  it('changes the limit of the active step in one order and shows it in the history', async () => {
    await createOrder();
    const res = await app.inject({
      method: 'POST',
      url: '/zlecenia/1/kroki/1/limit',
      headers: FORM,
      payload: 'limitDays=6&person=Piotr',
    });
    expect(res.statusCode).toBe(303);
    const card = await app.inject({ method: 'GET', url: '/?zlecenie=1' });
    expect(card.body).toMatch(/limit 6 dni/);
    expect(card.body).toContain('Piotr: zmiana limitu „Ustalenie terminu pomiaru w terenie” (2 → 6 dni)');
    const bad = await app.inject({
      method: 'POST',
      url: '/zlecenia/1/kroki/1/limit',
      headers: FORM,
      payload: 'limitDays=0&person=Piotr',
    });
    expect(bad.statusCode).toBe(400);
    expect(bad.body).toContain('od 1 do 365');
  });
});
