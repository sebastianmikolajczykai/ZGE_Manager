import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { AppDatabase } from '../../../src/db.js';
import { buildApp } from '../../../src/app.js';

const FORM = { 'content-type': 'application/x-www-form-urlencoded' };
const STEPS_BEFORE_PAYMENT = 12; // „Podział nieruchomości”: krok 13 = Zapłata

describe('Niezapłacone screens', () => {
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

  const createOrder = async () => {
    const res = await post('/zlecenia', {
      clientName: 'Karol Dłużnik',
      phone: '600 100 200',
      town: 'Przykładowo',
      workTypeId: '1',
      measurementOn: '2026-11-20',
      pricePln: '3 000',
      person: 'Anna',
    });
    return Number(String(res.headers.location).split('zlecenie=')[1]);
  };

  const handOver = async () => {
    const id = await createOrder();
    for (let step = 1; step <= STEPS_BEFORE_PAYMENT; step++) {
      await post(`/zlecenia/${id}/kroki/${step}/zrobione`, { person: 'Anna' });
    }
    return id;
  };

  const get = (url: string) => app.inject({ method: 'GET', url });

  it('menu has a "Niezapłacone" tab with an empty state', async () => {
    const res = await get('/niezaplacone');
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('href="/niezaplacone"');
    expect(res.body).toContain('Brak niezapłaconych zleceń');
  });

  it('an order handed over to the client moves from the board to Niezapłacone', async () => {
    const id = await handOver();
    expect((await get('/')).body).not.toContain('Karol Dłużnik');
    const page = await get(`/niezaplacone?zlecenie=${id}`);
    expect(page.body).toContain('Karol Dłużnik');
    expect(page.body).toContain('3000 zł');
    expect(page.body).toContain('Rozmowa: Piotr');
    expect(page.body).toContain('Zapłacone: Anna');
  });

  it('after the payment limit (14 working days) the row is red: "zadzwoń i przypomnij o zapłacie"', async () => {
    const id = await handOver(); // 20.11
    today = '2026-12-10'; // 14. dzień roboczy
    const page = await get(`/niezaplacone?zlecenie=${id}`);
    expect(page.body).toContain('c-red');
    expect(page.body).toContain('zadzwoń i przypomnij o zapłacie');
  });

  it('shows the total still to be paid and a red badge in the menu when someone should be reminded', async () => {
    await handOver();
    await handOver();
    today = '2026-12-10';
    const page = (await get('/niezaplacone')).body;
    expect(page).toMatch(/Razem do zapłaty[\s\S]*?6000 zł/);
    expect(page).toMatch(/Do przypomnienia dziś[\s\S]*?<b[^>]*>2</);
    const menu = page.slice(page.indexOf('<aside'), page.indexOf('</aside>'));
    expect(menu).toMatch(/href="\/niezaplacone"[\s\S]*?class="badge"[^>]*>2</);
  });

  it('a reminder call is kept in the order history with its note', async () => {
    const id = await handOver();
    const res = await post(`/niezaplacone/${id}/rozmowa`, { person: 'Piotr', note: 'zapłaci w piątek' });
    expect(res.statusCode).toBe(303);
    const page = await get(`/niezaplacone?zlecenie=${id}`);
    expect(page.body).toContain('Piotr: przypomnienie o zapłacie (zapłaci w piątek)');
  });

  it('"Zapłacone" closes the order: it leaves Niezapłacone, the card says completed', async () => {
    const id = await handOver();
    await post(`/niezaplacone/${id}/zaplacone`, { person: 'Anna' });
    expect((await get('/niezaplacone')).body).toContain('Brak niezapłaconych zleceń');
    expect((await get(`/?zlecenie=${id}`)).body).toContain('Zlecenie zakończone');
  });

  const undoAction = (body: string) => {
    const match = /action="(\/zlecenia\/\d+\/historia\/\d+\/cofnij)"/.exec(body);
    expect(match, 'brak przycisku Cofnij w historii').not.toBeNull();
    return String(match?.[1]);
  };

  it('"Zapłacone" can be undone: Niezapłacone lists recently paid orders, the card history offers "Cofnij"', async () => {
    const id = await handOver();
    await post(`/niezaplacone/${id}/zaplacone`, { person: 'Anna' });
    const list = (await get('/niezaplacone')).body;
    expect(list).toContain('Ostatnio zapłacone');
    expect(list).toContain(`href="/?zlecenie=${id}"`);

    const res = await post(undoAction((await get(`/?zlecenie=${id}`)).body), { person: 'Piotr' });
    expect(res.statusCode).toBe(303);
    expect(res.headers.location).toBe(`/?zlecenie=${id}`);
    expect((await get('/niezaplacone')).body).toContain('Karol Dłużnik');
    expect((await get(`/?zlecenie=${id}`)).body).toContain('Piotr: cofnięcie „Zapłata” (zrobione)');
  });

  it('a reminder call can be undone from the Niezapłacone card and you stay on that card', async () => {
    const id = await handOver();
    await post(`/niezaplacone/${id}/rozmowa`, { person: 'Anna', note: 'pomyłka' });
    const card = (await get(`/niezaplacone?zlecenie=${id}`)).body;
    expect(card).toContain('name="widok" value="niezaplacone"');

    const res = await post(undoAction(card), { person: 'Anna', widok: 'niezaplacone' });
    expect(res.headers.location).toBe(`/niezaplacone?zlecenie=${id}`);
    expect((await get(`/niezaplacone?zlecenie=${id}`)).body).toMatch(
      /<s>[\s\S]*przypomnienie o zapłacie \(pomyłka\)/,
    );
  });

  it('goes back to an older entry: undoes it and all newer ones, card shows the step again', async () => {
    const id = await handOver();
    await post(`/niezaplacone/${id}/zaplacone`, { person: 'Anna' });
    const card = (await get(`/?zlecenie=${id}`)).body;
    const backTo = [...card.matchAll(/action="(\/zlecenia\/\d+\/historia\/\d+\/cofnij-do)"/g)].map((m) =>
      String(m[1]),
    );
    expect(backTo.length).toBeGreaterThan(0);

    // najstarszy możliwy wpis = pierwsze odhaczenie
    const res = await post(String(backTo.at(-1)), { person: 'Piotr' });
    expect(res.statusCode).toBe(303);
    expect(res.headers.location).toBe(`/?zlecenie=${id}`);
    expect((await get('/niezaplacone')).body).toContain('Brak niezapłaconych zleceń');
    expect((await get(`/?zlecenie=${id}`)).body).not.toContain('Zlecenie zakończone');
  });

  it('going back to an entry that cannot be reached shows a readable error', async () => {
    const id = await handOver();
    const res = await post(`/zlecenia/${id}/historia/999999/cofnij-do`, { person: 'Anna' });
    expect(res.statusCode).toBe(400);
    expect(res.body).toContain('Do tego wpisu nie można cofnąć zlecenia');
  });

  it('undoing an entry that is no longer the newest shows a readable error', async () => {
    const id = await handOver();
    const older = undoAction((await get(`/?zlecenie=${id}`)).body);
    await post(`/niezaplacone/${id}/rozmowa`, { person: 'Anna' });
    const res = await post(older, { person: 'Anna' });
    expect(res.statusCode).toBe(400);
    expect(res.body).toContain('Najpierw cofnij nowsze wpisy');
  });

  it('an action on an order that is not waiting for payment shows a readable error', async () => {
    const id = await createOrder();
    const res = await post(`/niezaplacone/${id}/zaplacone`, { person: 'Anna' });
    expect(res.statusCode).toBe(400);
    expect(res.body).toContain('nie czeka na zapłatę');
  });

  it('unknown order shows 404', async () => {
    const res = await get('/niezaplacone?zlecenie=999');
    expect(res.statusCode).toBe(404);
    expect(res.body).toContain('Nie ma zlecenia o numerze 999');
  });
});
