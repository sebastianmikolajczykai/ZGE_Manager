import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { AppDatabase } from '../../../src/db.js';
import { WorkTypeRepository } from '../../../src/modules/work-types/work-type-repository.js';
import { OrderService } from '../../../src/modules/orders/order-service.js';
import { OfferService } from '../../../src/modules/offers/offer-service.js';
import { StatsService } from '../../../src/modules/stats/stats-service.js';
import { UrgencyRules, DEFAULT_URGENCY_SETTINGS } from '../../../src/modules/urgency/urgency-rules.js';

const PERSON = 'Osoba A';

describe('StatsService (klienci i dochód w jednym miejscu)', () => {
  let dir: string;
  let db: AppDatabase;
  let today: string;
  let orders: OrderService;
  let offers: OfferService;
  let stats: StatsService;
  let workTypeId: number;

  const order = (clientName: string, phone: string, pricePln: number | null) =>
    orders.create(
      {
        clientName,
        phone,
        town: 'Przykładowo',
        workTypeId,
        plot: null,
        office: null,
        pricePln,
        note: null,
        measurementOn: null,
      },
      PERSON,
    );
  /** Odhacza wszystko aż do kroku „Zapłata” włącznie (= klient zapłacił dziś). */
  const pay = (id: number) => {
    for (let step = 1; step <= 2; step++) orders.completeStep(id, step, PERSON);
  };

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'zge-'));
    db = AppDatabase.open(path.join(dir, 'zge.db'));
    db.migrate();
    workTypeId = new WorkTypeRepository(db).create({
      name: 'Test',
      steps: [
        { name: 'Praca', kind: 'own', limitDays: 2, provisional: false },
        { name: 'Zapłata', kind: 'waiting', limitDays: 14, provisional: false, payment: true },
      ],
    });
    today = '2026-10-05';
    orders = new OrderService(db, () => today);
    offers = new OfferService(db, () => today, new UrgencyRules(DEFAULT_URGENCY_SETTINGS));
    stats = new StatsService(db, () => today);
  });

  afterEach(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('with no data: zero clients, zero income and the current month in the table', () => {
    const s = stats.summary();
    expect(s).toMatchObject({ totalClients: 0, incomeTotalPln: 0, incomeThisMonthPln: 0 });
    expect(s.months.map((m) => m.month)).toEqual(['2026-10']);
  });

  it('counts a client once per phone number, even written differently or with a second order', () => {
    order('Jan Przykładowy', '600 100 200', 1000);
    order('Jan Przykładowy', '+48 600-100-200', 500);
    order('Ewa Przykładowa', '601 000 000', 800);
    expect(stats.summary().totalClients).toBe(2);
  });

  it('income = prices of orders marked "Zapłacone", by the month of payment', () => {
    const a = order('Jan', '600 100 200', 1000);
    const b = order('Ewa', '601 000 000', 2500.5);
    order('Adam', '602 000 000', 700); // jeszcze nie zapłacone
    pay(a);
    today = '2026-11-03';
    pay(b);

    const s = stats.summary();
    expect(s.incomeTotalPln).toBe(3500.5);
    expect(s.incomeThisMonthPln).toBe(2500.5);
    expect(s.months.find((m) => m.month === '2026-10')?.incomePln).toBe(1000);
    expect(s.months.find((m) => m.month === '2026-11')).toMatchObject({ incomePln: 2500.5, paidOrders: 1 });
  });

  it('shows what is still to be paid and the value of orders in progress', () => {
    const waiting = order('Jan', '600 100 200', 1000);
    orders.completeStep(waiting, 1, PERSON); // oddane, czeka na zapłatę
    order('Ewa', '601 000 000', 400); // w realizacji
    const s = stats.summary();
    expect(s.unpaidPln).toBe(1000);
    expect(s.inProgressPln).toBe(400);
  });

  it('counts paid orders without a price separately (not as 0 zł income)', () => {
    pay(order('Jan', '600 100 200', null));
    const s = stats.summary();
    expect(s.incomeTotalPln).toBe(0);
    expect(s.paidWithoutPrice).toBe(1);
  });

  it('a new client is counted in the month of the first order; months go newest first', () => {
    order('Jan', '600 100 200', 100);
    today = '2026-12-01';
    order('Jan', '600 100 200', 100); // ten sam klient – nie jest nowy
    order('Ewa', '601 000 000', 100);

    const months = stats.summary().months;
    expect(months.map((m) => m.month)).toEqual(['2026-12', '2026-11', '2026-10']);
    expect(months.map((m) => m.newClients)).toEqual([1, 0, 1]);
    expect(months.map((m) => m.orders)).toEqual([2, 0, 1]);
  });

  it('counts offers sent and accepted in each month', () => {
    const offer = offers.create(
      {
        clientName: 'Jan',
        phone: '600 100 200',
        workTypeId,
        sentOn: '2026-10-01',
        town: null,
        plot: null,
        pricePln: null,
        note: null,
      },
      PERSON,
    );
    offers.markAccepted(offer, PERSON, order('Jan', '600 100 200', 100));
    expect(stats.summary().months[0]).toMatchObject({ offersSent: 1, offersAccepted: 1 });
  });

  it('lists clients with the number of orders, the sum paid and the last order, newest first', () => {
    const a = order('Jan Przykładowy', '600 100 200', 1000);
    pay(a);
    today = '2026-11-10';
    order('Jan Przykładowy', '600100200', 300);
    order('Ewa Przykładowa', '601 000 000', 800);

    const clients = stats.clients();
    expect(clients).toHaveLength(2);
    expect(clients[0]).toMatchObject({ name: 'Ewa Przykładowa', orders: 1, paidPln: 0 });
    expect(clients[1]).toMatchObject({
      name: 'Jan Przykładowy',
      phone: '600100200',
      orders: 2,
      paidPln: 1000,
      firstOrderOn: '2026-10-05',
      lastOrderOn: '2026-11-10',
      lastOrderId: 2,
    });
  });

  it('a work type without a "Zapłata" step counts as income on the day the order was completed', () => {
    const simple = new WorkTypeRepository(db).create({
      name: 'Bez zapłaty',
      steps: [{ name: 'Praca', kind: 'own', limitDays: 2, provisional: false }],
    });
    const id = orders.create(
      {
        clientName: 'Jan',
        phone: '600 100 200',
        town: 'X',
        workTypeId: simple,
        plot: null,
        office: null,
        pricePln: 900,
        note: null,
        measurementOn: null,
      },
      PERSON,
    );
    orders.completeStep(id, 1, PERSON);
    expect(stats.summary().incomeThisMonthPln).toBe(900);
  });

  it('the month table goes across the new year', () => {
    today = '2026-12-15';
    order('Jan', '600 100 200', 100);
    today = '2027-01-10';
    expect(stats.summary().months.map((m) => m.month)).toEqual(['2027-01', '2026-12']);
  });
});
