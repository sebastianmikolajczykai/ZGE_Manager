import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { AppDatabase } from '../../../src/db.js';
import { WorkTypeRepository } from '../../../src/modules/work-types/work-type-repository.js';
import { OfferService } from '../../../src/modules/offers/offer-service.js';
import type { OfferInput } from '../../../src/modules/offers/offer-input.js';
import { UrgencyRules, DEFAULT_URGENCY_SETTINGS } from '../../../src/modules/urgency/urgency-rules.js';

const PERSON = 'Osoba A';
const OTHER = 'Osoba B';

describe('OfferService', () => {
  let dir: string;
  let db: AppDatabase;
  let today: string;
  let offers: OfferService;
  let workTypeId: number;

  const input = (change: Partial<OfferInput> = {}): OfferInput => ({
    clientName: 'Jan Przykładowy',
    phone: '600 100 200',
    workTypeId,
    sentOn: today,
    town: 'Przykładowo',
    plot: null,
    pricePln: 2500,
    note: null,
    ...change,
  });

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'zge-'));
    db = AppDatabase.open(path.join(dir, 'zge.db'));
    db.migrate();
    workTypeId = new WorkTypeRepository(db).create({
      name: 'Test',
      steps: [{ name: 'Krok', kind: 'own', limitDays: 2, provisional: false }],
    });
    today = '2026-11-20'; // piątek
    offers = new OfferService(db, () => today, new UrgencyRules(DEFAULT_URGENCY_SETTINGS));
  });

  afterEach(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('creates an open offer with history "who sent it"', () => {
    const id = offers.create(input(), PERSON);
    const offer = offers.get(id);
    expect(offer).toMatchObject({
      clientName: 'Jan Przykładowy',
      status: 'open',
      sentBy: PERSON,
      lastContactOn: today,
    });
    expect(offers.history(id)).toMatchObject([
      { happenedOn: today, person: PERSON, action: 'created', note: null },
    ]);
  });

  it('requires the person who sent the offer', () => {
    expect(() => offers.create(input(), ' ')).toThrow(/Wybierz, kto/);
  });

  it('rejects an unknown work type', () => {
    expect(() => offers.create(input({ workTypeId: 999 }), PERSON)).toThrow(/Nieznany rodzaj pracy/);
  });

  describe('reminder after 7 working days (day 0 = sending day)', () => {
    const colourOn = (id: number, date: string) => {
      today = date;
      return offers.rows().find((r) => r.offerId === id)?.urgency.colour;
    };

    it('is green until day 5, yellow on day 6 and red on day 7 (weekends skipped)', () => {
      const id = offers.create(input({ sentOn: '2026-11-20' }), PERSON); // pt
      expect(colourOn(id, '2026-11-27')).toBe('green'); // 5. dzień roboczy
      expect(colourOn(id, '2026-11-30')).toBe('yellow'); // 6.
      expect(colourOn(id, '2026-12-01')).toBe('red'); // 7.
    });

    it('a call with "remind again" restarts the 7 days', () => {
      const id = offers.create(input({ sentOn: '2026-11-20' }), PERSON);
      today = '2026-12-01';
      offers.recordCall(id, OTHER, 'myśli, oddzwoni', 'again');
      expect(colourOn(id, '2026-12-01')).toBe('green');
      expect(offers.get(id)?.lastContactOn).toBe('2026-12-01');
      expect(offers.history(id).at(-1)).toMatchObject({
        happenedOn: '2026-12-01',
        person: OTHER,
        action: 'called',
        note: 'myśli, oddzwoni',
      });
    });
  });

  it('lists only open offers, most urgent first', () => {
    const old = offers.create(input({ clientName: 'Stara', sentOn: '2026-11-02' }), PERSON);
    const fresh = offers.create(input({ clientName: 'Nowa' }), PERSON);
    const ended = offers.create(input({ clientName: 'Zakończona' }), PERSON);
    offers.recordCall(ended, PERSON, null, 'end');
    expect(offers.rows().map((r) => r.offerId)).toEqual([old, fresh]);
  });

  it('a call with "contact ended" closes the offer', () => {
    const id = offers.create(input(), PERSON);
    offers.recordCall(id, PERSON, 'nie odbiera od miesiąca', 'end');
    expect(offers.get(id)?.status).toBe('closed');
    expect(offers.history(id).at(-1)?.action).toBe('contact_ended');
  });

  it('rejecting stores the optional reason', () => {
    const id = offers.create(input(), PERSON);
    offers.reject(id, OTHER, 'za drogo');
    expect(offers.get(id)).toMatchObject({ status: 'rejected', closedOn: today });
    expect(offers.history(id).at(-1)).toMatchObject({ action: 'rejected', note: 'za drogo' });
  });

  it('accepting links the new order and closes the offer', () => {
    const id = offers.create(input(), PERSON);
    const orderId = Number(
      db.connection
        .prepare(
          "INSERT INTO orders (client_name, phone, town, work_type_id, received_on) VALUES ('J', '600100200', 'X', ?, ?)",
        )
        .run(workTypeId, today).lastInsertRowid,
    );
    offers.markAccepted(id, PERSON, orderId);
    expect(offers.get(id)).toMatchObject({ status: 'accepted', orderId });
  });

  it('does not allow actions on a closed offer', () => {
    const id = offers.create(input(), PERSON);
    offers.reject(id, PERSON, null);
    expect(() => offers.recordCall(id, PERSON, null, 'again')).toThrow(/zamknięta/);
  });

  it('reports a missing offer clearly', () => {
    expect(() => offers.reject(404, PERSON, null)).toThrow(/Nie ma oferty o numerze 404/);
    expect(offers.get(404)).toBeNull();
  });

  it('uses the reminder period set in Ustawienia (e.g. 10 working days instead of 7)', () => {
    const tenDays = new OfferService(
      db,
      () => today,
      new UrgencyRules(DEFAULT_URGENCY_SETTINGS),
      () => 10,
    );
    // 20.11 (pt) + 7 dni roboczych = 01.12; przy 10 dniach to jeszcze zielone.
    expect(tenDays.urgencyOf('2026-11-20', '2026-12-01').colour).toBe('green');
    expect(offers.urgencyOf('2026-11-20', '2026-12-01').colour).toBe('red');
    expect(tenDays.urgencyOf('2026-11-20', '2026-12-04').colour).toBe('red');
  });

  describe('przypomnienie w Kalendarzu Google: dzień telefonu', () => {
    it('is 7 working days after sending (Friday 20.11 → Tuesday 1.12)', () => {
      const id = offers.create(input(), PERSON);
      expect(offers.callDueOn(id)).toBe('2026-12-01');
    });

    it('counts from the last call, and is today when the call is already late', () => {
      const id = offers.create(input({ sentOn: '2026-11-02' }), PERSON);
      expect(offers.callDueOn(id)).toBe(today);
      offers.recordCall(id, PERSON, null, 'again');
      expect(offers.callDueOn(id)).toBe('2026-12-01');
    });

    it('rejects an unknown offer', () => {
      expect(() => offers.callDueOn(999)).toThrow(/999/);
    });
  });
});
