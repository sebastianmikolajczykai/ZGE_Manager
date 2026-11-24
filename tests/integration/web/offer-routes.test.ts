import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { AppDatabase } from '../../../src/db.js';
import { buildApp } from '../../../src/app.js';

const FORM = { 'content-type': 'application/x-www-form-urlencoded' };

describe('offer screens', () => {
  let dir: string;
  let db: AppDatabase;
  let app: FastifyInstance;
  let today: string;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'zge-'));
    db = AppDatabase.open(path.join(dir, 'zge.db'));
    db.migrate();
    today = '2026-11-20';
    app = buildApp({ db, today: () => today, defaultPeople: ['Anna', 'Piotr'] });
  });

  afterEach(async () => {
    await app.close();
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  const post = (url: string, fields: Record<string, string>) =>
    app.inject({ method: 'POST', url, headers: FORM, payload: new URLSearchParams(fields).toString() });

  const createOffer = (fields: Record<string, string> = {}) =>
    post('/oferty', {
      clientName: 'Ewa Ofertowa',
      phone: '600 100 200',
      workTypeId: '1',
      sentOn: '2026-11-20',
      town: 'Przykładowo',
      pricePln: '2 800',
      person: 'Anna',
      ...fields,
    });

  const idFrom = (location: unknown) => Number(String(location).split('oferta=')[1]);

  it('menu has an "Oferty" tab and the empty list invites to add an offer', async () => {
    const res = await app.inject({ method: 'GET', url: '/oferty' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('href="/oferty"');
    expect(res.body).toContain('+ Dodaj ofertę');
    expect(res.body).toContain('Brak otwartych ofert');
  });

  it('adding an offer shows it on the offers list (not on the order board) with its card open', async () => {
    const created = await createOffer();
    expect(created.statusCode).toBe(303);
    const id = idFrom(created.headers.location);
    const page = await app.inject({ method: 'GET', url: `/oferty?oferta=${id}` });
    expect(page.body).toContain('Ewa Ofertowa');
    expect(page.body).toContain('2800 zł');
    expect(page.body).toContain('Rozmowa: Anna');
    expect(page.body).toContain('Anna: wysłanie oferty');
    const board = await app.inject({ method: 'GET', url: '/' });
    expect(board.body).not.toContain('Ewa Ofertowa');
  });

  it('invalid offer re-shows the form with the error and typed values', async () => {
    const res = await createOffer({ phone: '12' });
    expect(res.statusCode).toBe(400);
    expect(res.body).toContain('Nieprawidłowy numer telefonu');
    expect(res.body).toContain('value="Ewa Ofertowa"');
  });

  it('after 7 working days the offer is red with "zadzwoń do klienta"', async () => {
    const id = idFrom((await createOffer()).headers.location);
    today = '2026-12-01';
    const page = await app.inject({ method: 'GET', url: `/oferty?oferta=${id}` });
    expect(page.body).toContain('c-red');
    expect(page.body).toContain('zadzwoń do klienta');
  });

  it('a call with "remind again" is noted in history; "contact ended" removes it from the list', async () => {
    const id = idFrom((await createOffer()).headers.location);
    await post(`/oferty/${id}/telefon`, { person: 'Piotr', note: 'myśli', next: 'again' });
    let page = await app.inject({ method: 'GET', url: `/oferty?oferta=${id}` });
    expect(page.body).toContain('Piotr: telefon (myśli)');
    await post(`/oferty/${id}/telefon`, { person: 'Anna', note: '', next: 'end' });
    page = await app.inject({ method: 'GET', url: '/oferty' });
    expect(page.body).toContain('Brak otwartych ofert');
    const card = await app.inject({ method: 'GET', url: `/oferty?oferta=${id}` });
    expect(card.body).toContain('Kontakt zakończony');
    expect(card.body).not.toContain('Rozmowa: Anna');
  });

  it('"kontakt zakończony" can be undone: closed offers are listed, the card history offers "Cofnij"', async () => {
    const id = idFrom((await createOffer()).headers.location);
    await post(`/oferty/${id}/telefon`, { person: 'Anna', note: '', next: 'end' });
    const list = (await app.inject({ method: 'GET', url: '/oferty' })).body;
    expect(list).toContain('Ostatnio zamknięte');
    expect(list).toContain(`href="/oferty?oferta=${id}"`);

    const card = (await app.inject({ method: 'GET', url: `/oferty?oferta=${id}` })).body;
    const action = /action="(\/oferty\/\d+\/historia\/\d+\/cofnij)"/.exec(card)?.[1];
    expect(action).toBeDefined();
    const res = await post(String(action), { person: 'Piotr' });
    expect(res.headers.location).toBe(`/oferty?oferta=${id}`);
    const after = (await app.inject({ method: 'GET', url: `/oferty?oferta=${id}` })).body;
    expect(after).toContain('Piotr: cofnięcie (kontakt zakończony)');
    expect(after).toContain('Rozmowa: Anna');
  });

  it('undoing a wrong entry shows a readable error', async () => {
    const id = idFrom((await createOffer()).headers.location);
    const res = await post(`/oferty/${id}/historia/999/cofnij`, { person: 'Anna' });
    expect(res.statusCode).toBe(400);
    expect(res.body).toContain('Tego wpisu nie można cofnąć');
  });

  it('rejecting with a reason closes the offer and keeps the reason in history', async () => {
    const id = idFrom((await createOffer()).headers.location);
    await post(`/oferty/${id}/odrzucona`, { person: 'Anna', reason: 'za drogo' });
    const card = await app.inject({ method: 'GET', url: `/oferty?oferta=${id}` });
    expect(card.body).toContain('Oferta odrzucona');
    expect(card.body).toContain('Anna: odrzucona (za drogo)');
  });

  it('"Przyjęta → zrób zlecenie" prefills the order form; saving it creates the order and closes the offer', async () => {
    const id = idFrom((await createOffer({ plot: '12/3' })).headers.location);
    const form = await app.inject({ method: 'GET', url: `/zlecenia/nowe?oferta=${id}` });
    expect(form.body).toContain('value="Ewa Ofertowa"');
    expect(form.body).toContain('value="12/3"');
    expect(form.body).toContain(`name="offerId" value="${id}"`);

    const saved = await post('/zlecenia', {
      clientName: 'Ewa Ofertowa',
      phone: '600 100 200',
      town: 'Przykładowo',
      workTypeId: '1',
      measurementOn: '2026-11-30',
      person: 'Piotr',
      offerId: String(id),
    });
    expect(saved.statusCode).toBe(303);
    expect((await app.inject({ method: 'GET', url: '/' })).body).toContain('Ewa Ofertowa');
    const card = await app.inject({ method: 'GET', url: `/oferty?oferta=${id}` });
    expect(card.body).toContain('Oferta przyjęta');
    expect(card.body).toContain('Piotr: przyjęta (zlecenie nr 1)');
  });

  it('an action on a closed offer shows an error instead of crashing', async () => {
    const id = idFrom((await createOffer()).headers.location);
    await post(`/oferty/${id}/odrzucona`, { person: 'Anna', reason: '' });
    const res = await post(`/oferty/${id}/telefon`, { person: 'Anna', note: '', next: 'again' });
    expect(res.statusCode).toBe(400);
    expect(res.body).toContain('jest już zamknięta');
  });

  it('unknown offer shows 404', async () => {
    const res = await app.inject({ method: 'GET', url: '/oferty?oferta=999' });
    expect(res.statusCode).toBe(404);
    expect(res.body).toContain('Nie ma oferty o numerze 999');
  });

  it('new offer form lists work types and people', async () => {
    const res = await app.inject({ method: 'GET', url: '/oferty/nowa' });
    expect(res.body).toContain('Podział nieruchomości');
    expect(res.body).toContain('Kto wysłał');
    expect(res.body).toContain('value="2026-11-20"');
  });

  describe('ukryte kwoty i przypomnienie w Kalendarzu Google', () => {
    it('the offers list shows no prices; the price is on the opened card', async () => {
      const id = idFrom((await createOffer()).headers.location);
      const list = (await app.inject({ method: 'GET', url: '/oferty' })).body;
      expect(list).toContain('Ewa Ofertowa');
      expect(list).not.toContain('zł');
      const card = (await app.inject({ method: 'GET', url: `/oferty?oferta=${id}` })).body;
      expect(card).toContain('2800 zł');
    });

    it('an open offer card has "Dodaj przypomnienie" for the call day (7 working days after sending)', async () => {
      const id = idFrom((await createOffer()).headers.location);
      const card = (await app.inject({ method: 'GET', url: `/oferty?oferta=${id}` })).body;
      const href = card.match(
        /href="(https:\/\/calendar\.google\.com[^"]*)"[^>]*>[\s\S]*?Dodaj przypomnienie/,
      )?.[1];
      expect(href, 'brak przycisku kalendarza').toBeDefined();
      const url = new URL((href ?? '').replaceAll('&amp;', '&'));
      expect(url.searchParams.get('text')).not.toContain('Ewa Ofertowa');
      expect(url.searchParams.get('details')).toContain('Klient: Ewa Ofertowa');
      expect(url.searchParams.get('details')).not.toContain('zł');
      expect(card).toMatch(/target="_blank"/);
    });

    it('a closed offer has no reminder button', async () => {
      const id = idFrom((await createOffer()).headers.location);
      await app.inject({
        method: 'POST',
        url: `/oferty/${id}/telefon`,
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        payload: 'person=Anna&next=end',
      });
      const card = (await app.inject({ method: 'GET', url: `/oferty?oferta=${id}` })).body;
      expect(card).not.toContain('calendar.google.com');
    });
  });
});
