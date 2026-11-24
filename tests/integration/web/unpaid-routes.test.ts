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

  it('shows how many orders wait for payment (no total amount: the monitor is visible to guests) and a red badge', async () => {
    await handOver();
    await handOver();
    today = '2026-12-10';
    const page = (await get('/niezaplacone')).body;
    expect(page).toMatch(/Czeka na zapłatę[\s\S]*?<b[^>]*>2</);
    expect(page).not.toContain('zł');
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

  describe('wiadomość SMS do klienta', () => {
    const ACCOUNT = '66 1050 1445 1000 0090 3021 6767';
    const REVIEW = 'https://g.page/r/przyklad/review';

    it('without an account number the card says to fill it in Ustawienia, no copy button', async () => {
      const id = await handOver();
      const card = (await get(`/niezaplacone?zlecenie=${id}`)).body;
      expect(card).toContain('Wiadomość do klienta (SMS)');
      expect(card).toContain('Uzupełnij numer konta w Ustawieniach');
      expect(card).toContain('href="/ustawienia#wiadomosc"');
      expect(card).not.toContain('data-copy=');
    });

    it('with Settings filled the card shows the ready message and a copy button', async () => {
      await post('/ustawienia/wiadomosc', { bankAccount: ACCOUNT, reviewLink: REVIEW, person: 'Anna' });
      const id = await handOver();
      const card = (await get(`/niezaplacone?zlecenie=${id}`)).body;
      expect(card).toContain(
        'w związku z zakończeniem pracy „Podział nieruchomości” (Przykładowo) kwota do zapłaty to 3 000,00 zł',
      );
      expect(card).toContain(`konto: ${ACCOUNT}`);
      expect(card).toContain(REVIEW);
      expect(card).toContain('data-copy="sms-tekst"');
      expect(card).toContain('600 100 200');
    });

    it('the full order card shows the message too while the order waits for payment, not earlier', async () => {
      await post('/ustawienia/wiadomosc', { bankAccount: ACCOUNT, reviewLink: '', person: 'Anna' });
      const id = await createOrder();
      expect((await get(`/?zlecenie=${id}`)).body).not.toContain('Wiadomość do klienta (SMS)');
      for (let step = 1; step <= STEPS_BEFORE_PAYMENT; step++) {
        await post(`/zlecenia/${id}/kroki/${step}/zrobione`, { person: 'Anna' });
      }
      expect((await get(`/?zlecenie=${id}`)).body).toContain('data-copy="sms-tekst"');
    });
  });

  describe('Ustawienia: dane do wiadomości SMS', () => {
    it('settings show empty fields for the account and the review link', async () => {
      const page = (await get('/ustawienia')).body;
      expect(page).toContain('id="wiadomosc"');
      expect(page).toMatch(/name="bankAccount"[^>]*value=""/);
      expect(page).toMatch(/name="reviewLink"[^>]*value=""/);
    });

    it('saves the fields and shows who changed them', async () => {
      const res = await post('/ustawienia/wiadomosc', {
        bankAccount: '66105014451000009030216767',
        reviewLink: '',
        person: 'Piotr',
      });
      expect(res.statusCode).toBe(303);
      expect(res.headers.location).toBe('/ustawienia#wiadomosc');
      const page = (await get('/ustawienia')).body;
      expect(page).toMatch(/name="bankAccount"[^>]*value="66 1050 1445 1000 0090 3021 6767"/);
      expect(page).toContain('Piotr: Numer konta');
    });

    it('a wrong account number shows a readable error and keeps what was typed', async () => {
      const res = await post('/ustawienia/wiadomosc', {
        bankAccount: '12 3456',
        reviewLink: '',
        person: 'Anna',
      });
      expect(res.statusCode).toBe(400);
      expect(res.body).toContain('Numer konta musi mieć 26 cyfr');
      expect(res.body).toMatch(/name="bankAccount"[^>]*value="12 3456"/);
    });
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

  describe('ukryte kwoty i przypomnienie w Kalendarzu Google', () => {
    it('the list shows the order number instead of the client and no amounts; the amount is on the opened card', async () => {
      const id = await handOver();
      await post(`/zlecenia/${id}/numer`, { orderNumber: '125 podział', person: 'Anna' });
      const list = (await get('/niezaplacone')).body;
      expect(list).toContain('125 podział');
      expect(list).not.toContain('Karol Dłużnik');
      expect(list).not.toContain('zł');
      const card = (await get(`/niezaplacone?zlecenie=${id}`)).body;
      expect(card).toContain('Karol Dłużnik');
      expect(card).toContain('3000 zł');
    });

    it('"recently paid" shows no amounts', async () => {
      const id = await handOver();
      await post(`/niezaplacone/${id}/zaplacone`, { person: 'Anna' });
      const page = (await get('/niezaplacone')).body;
      expect(page).toContain('Ostatnio zapłacone');
      expect(page).not.toContain('zł');
    });

    it('the card offers a payment reminder in Google Calendar on the day the limit runs out', async () => {
      const id = await handOver(); // pt 20.11, limit 14 dni roboczych → 10.12
      await post(`/zlecenia/${id}/numer`, { orderNumber: '125 podział', person: 'Anna' });
      const card = (await get(`/niezaplacone?zlecenie=${id}`)).body;
      const href = card.match(
        /href="(https:\/\/calendar\.google\.com[^"]*)"[^>]*>[\s\S]*?Dodaj przypomnienie/,
      )?.[1];
      expect(href, 'brak przycisku kalendarza').toBeDefined();
      const url = new URL((href ?? '').replaceAll('&amp;', '&'));
      expect(url.searchParams.get('text')).toBe('Przypomnij o zapłacie: 125 podział');
      expect(url.searchParams.get('dates')).toBe('20261210/20261211');
      expect(url.searchParams.get('details')).not.toContain('zł');
      expect(card).toContain('10.12.2026');
    });
  });
});
