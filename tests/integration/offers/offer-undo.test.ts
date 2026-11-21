import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { AppDatabase } from '../../../src/db.js';
import { WorkTypeRepository } from '../../../src/modules/work-types/work-type-repository.js';
import { OfferService } from '../../../src/modules/offers/offer-service.js';
import { OrderService } from '../../../src/modules/orders/order-service.js';
import { UrgencyRules, DEFAULT_URGENCY_SETTINGS } from '../../../src/modules/urgency/urgency-rules.js';

const PERSON = 'Osoba A';

const entryId = (entry: { id: number } | undefined) => {
  if (!entry) throw new Error('brak wpisu w historii');
  return entry.id;
};
const OTHER = 'Osoba B';

/** Cofanie z historii oferty: telefon, kontakt zakończony, odrzucenie (po kolei, od najnowszego). */
describe('OfferService: cofanie wpisu z historii', () => {
  let dir: string;
  let db: AppDatabase;
  let today: string;
  let offers: OfferService;
  let id: number;

  const latestId = () => entryId(offers.history(id).at(-1));

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'zge-'));
    db = AppDatabase.open(path.join(dir, 'zge.db'));
    db.migrate();
    const workTypeId = new WorkTypeRepository(db).create({
      name: 'Test',
      steps: [{ name: 'Krok', kind: 'own', limitDays: 2, provisional: false }],
    });
    today = '2026-11-20';
    offers = new OfferService(db, () => today, new UrgencyRules(DEFAULT_URGENCY_SETTINGS));
    id = offers.create(
      {
        clientName: 'Jan Przykładowy',
        phone: '600 100 200',
        workTypeId,
        sentOn: '2026-11-10',
        town: null,
        plot: null,
        pricePln: null,
        note: null,
      },
      PERSON,
    );
  });

  afterEach(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('the sending itself cannot be undone', () => {
    expect(offers.undoableEntryId(id)).toBeNull();
  });

  it('undoes a call: the last contact date comes back, so the reminder is as before', () => {
    offers.recordCall(id, PERSON, 'oddzwoni', 'again');
    expect(offers.get(id)?.lastContactOn).toBe('2026-11-20');

    offers.undoEntry(id, latestId(), OTHER);

    expect(offers.get(id)?.lastContactOn).toBe('2026-11-10');
    const history = offers.history(id);
    expect(history[1]?.reverted).toBe(true);
    expect(history.at(-1)).toMatchObject({ person: OTHER, action: 'undone', note: 'telefon' });
  });

  it('undoes "kontakt zakończony": the offer is open again and back on the list', () => {
    offers.recordCall(id, PERSON, null, 'end');
    expect(offers.rows()).toHaveLength(0);

    offers.undoEntry(id, latestId(), PERSON);

    expect(offers.get(id)).toMatchObject({ status: 'open', closedOn: null });
    expect(offers.rows()).toHaveLength(1);
    expect(offers.history(id).at(-1)?.note).toBe('kontakt zakończony');
  });

  it('undoes "odrzucona"', () => {
    offers.reject(id, PERSON, 'za drogo');
    offers.undoEntry(id, latestId(), PERSON);
    expect(offers.get(id)?.status).toBe('open');
    expect(offers.history(id).at(-1)?.note).toBe('odrzucona');
  });

  it('goes back one by one and refuses an older entry first', () => {
    offers.recordCall(id, PERSON, null, 'again');
    const call = latestId();
    offers.recordCall(id, PERSON, null, 'end');

    expect(() => offers.undoEntry(id, call, PERSON)).toThrow(/najpierw cofnij nowsze/i);
    offers.undoEntry(id, latestId(), PERSON);
    expect(offers.undoableEntryId(id)).toBe(call);
  });

  it('refuses to undo twice, a wrong entry and an empty person', () => {
    offers.recordCall(id, PERSON, null, 'again');
    const call = latestId();
    expect(() => offers.undoEntry(id, call, '')).toThrow();
    offers.undoEntry(id, call, PERSON);
    expect(() => offers.undoEntry(id, call, PERSON)).toThrow(/nie można cofnąć/);
    expect(() => offers.undoEntry(id, 9999, PERSON)).toThrow(/nie można cofnąć/);
  });
});

describe('OfferService: cofnięcie „przyjęta” (oferta wraca, zlecenie znika)', () => {
  let dir: string;
  let db: AppDatabase;
  let offers: OfferService;
  let orders: OrderService;
  let offerId: number;
  let orderId: number;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'zge-'));
    db = AppDatabase.open(path.join(dir, 'zge.db'));
    db.migrate();
    const workTypeId = new WorkTypeRepository(db).create({
      name: 'Test',
      steps: [
        { name: 'Krok', kind: 'own', limitDays: 2, provisional: false },
        { name: 'Drugi', kind: 'own', limitDays: 2, provisional: false },
      ],
    });
    const today = () => '2026-11-20';
    orders = new OrderService(db, today);
    offers = new OfferService(db, today, new UrgencyRules(DEFAULT_URGENCY_SETTINGS), undefined, orders);
    offerId = offers.create(
      {
        clientName: 'Jan Przykładowy',
        phone: '600 100 200',
        workTypeId,
        sentOn: '2026-11-10',
        town: null,
        plot: null,
        pricePln: null,
        note: null,
      },
      PERSON,
    );
    orderId = orders.create(
      {
        clientName: 'Jan Przykładowy',
        phone: '600 100 200',
        town: 'X',
        workTypeId,
        plot: null,
        office: null,
        pricePln: null,
        note: null,
        measurementOn: null,
      },
      PERSON,
    );
    offers.markAccepted(offerId, PERSON, orderId);
  });

  afterEach(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('reopens the offer and deletes the order made from it', () => {
    offers.undoEntry(offerId, entryId(offers.history(offerId).at(-1)), OTHER);

    expect(offers.get(offerId)).toMatchObject({ status: 'open', closedOn: null, orderId: null });
    expect(orders.get(orderId)).toBeNull();
    expect(offers.history(offerId).at(-1)).toMatchObject({
      action: 'undone',
      person: OTHER,
      note: `przyjęta (usunięto zlecenie nr ${orderId})`,
    });
  });

  it('is not possible once a step of the order was done; nothing changes', () => {
    orders.completeStep(orderId, 1, PERSON);
    const entry = entryId(offers.history(offerId).at(-1));
    expect(offers.undoableEntryId(offerId)).toBeNull();
    expect(() => offers.undoEntry(offerId, entry, PERSON)).toThrow();
    expect(offers.get(offerId)?.status).toBe('accepted');
    expect(orders.get(orderId)).not.toBeNull();
  });
});
