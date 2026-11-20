import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { AppDatabase } from '../../../src/db.js';
import { WorkTypeRepository } from '../../../src/modules/work-types/work-type-repository.js';
import { OrderService } from '../../../src/modules/orders/order-service.js';
import { BoardService } from '../../../src/modules/board/board-service.js';
import { PaymentService } from '../../../src/modules/payments/payment-service.js';
import { UrgencyRules, DEFAULT_URGENCY_SETTINGS } from '../../../src/modules/urgency/urgency-rules.js';

const PERSON = 'Osoba A';
const OTHER = 'Osoba B';

describe('PaymentService (zakładka Niezapłacone)', () => {
  let dir: string;
  let db: AppDatabase;
  let today: string;
  let orders: OrderService;
  let payments: PaymentService;
  let board: BoardService;
  let workTypeId: number;

  const createOrder = (clientName = 'Jan Przykładowy') =>
    orders.create(
      {
        clientName,
        phone: '600 100 200',
        town: 'Przykładowo',
        workTypeId,
        plot: null,
        office: null,
        pricePln: 2500,
        note: null,
        measurementOn: null,
      },
      PERSON,
    );

  /** Zlecenie oddane klientowi dziś: krok „Zapłata” jest aktywny. */
  const handedOver = (clientName?: string) => {
    const id = createOrder(clientName);
    orders.completeStep(id, 1, PERSON);
    return id;
  };

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'zge-'));
    db = AppDatabase.open(path.join(dir, 'zge.db'));
    db.migrate();
    workTypeId = new WorkTypeRepository(db).create({
      name: 'Test',
      steps: [
        { name: 'Oddanie', kind: 'own', limitDays: 2, provisional: false },
        { name: 'Zapłata', kind: 'waiting', limitDays: 3, provisional: false, payment: true },
      ],
    });
    today = '2026-11-20'; // piątek
    const rules = new UrgencyRules(DEFAULT_URGENCY_SETTINGS);
    orders = new OrderService(db, () => today);
    payments = new PaymentService(db, orders, rules, () => today);
    board = new BoardService(db, orders, rules, () => today);
  });

  afterEach(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('an order reaching the payment step leaves the board and appears in Niezapłacone', () => {
    const id = handedOver();
    expect(board.rows().map((r) => r.orderId)).not.toContain(id);
    expect(payments.rows()).toEqual([
      expect.objectContaining({
        orderId: id,
        clientName: 'Jan Przykładowy',
        pricePln: 2500,
        handedOverOn: today,
      }),
    ]);
  });

  it('orders before the payment step stay on the board only', () => {
    const id = createOrder();
    expect(board.rows().map((r) => r.orderId)).toContain(id);
    expect(payments.rows()).toEqual([]);
  });

  it('colour follows the payment limit in working days (day 0 = handover)', () => {
    const id = handedOver(); // pt 20.11, limit 3
    const colourOn = (date: string) => {
      today = date;
      return payments.rows().find((r) => r.orderId === id)?.urgency.colour;
    };
    expect(colourOn('2026-11-23')).toBe('green');
    expect(colourOn('2026-11-24')).toBe('yellow');
    expect(colourOn('2026-11-25')).toBe('red');
  });

  it('a reminder call restarts the count and is noted in the order history', () => {
    const id = handedOver();
    today = '2026-11-25';
    payments.recordCall(id, OTHER, 'zapłaci w piątek');
    const row = payments.rows().find((r) => r.orderId === id);
    expect(row).toMatchObject({ lastContactOn: '2026-11-25', daysSinceContact: 0, lastPerson: OTHER });
    expect(row?.urgency.colour).toBe('green');
    expect(orders.history(id).at(-1)).toMatchObject({
      happenedOn: '2026-11-25',
      person: OTHER,
      action: 'payment_call',
      note: 'zapłaci w piątek',
    });
  });

  it('"Zapłacone" completes the order and removes it from Niezapłacone', () => {
    const id = handedOver();
    payments.markPaid(id, OTHER);
    expect(orders.get(id)?.status).toBe('completed');
    expect(payments.rows()).toEqual([]);
    expect(orders.history(id).at(-1)).toMatchObject({
      person: OTHER,
      action: 'step_done',
      stepName: 'Zapłata',
    });
  });

  it('lists the longest unpaid first', () => {
    const older = handedOver('Starszy');
    today = '2026-11-26';
    const newer = handedOver('Nowszy');
    expect(payments.rows().map((r) => r.orderId)).toEqual([older, newer]);
  });

  it('refuses a call or payment for an order that is not waiting for payment', () => {
    const id = createOrder();
    expect(() => payments.recordCall(id, PERSON, null)).toThrow(/nie czeka na zapłatę/);
    expect(() => payments.markPaid(id, PERSON)).toThrow(/nie czeka na zapłatę/);
    expect(() => payments.markPaid(999, PERSON)).toThrow(/Nie ma zlecenia o numerze 999/);
  });

  it('requires choosing who made the call', () => {
    const id = handedOver();
    expect(() => payments.recordCall(id, ' ', null)).toThrow(/Wybierz, kto/);
  });
});
