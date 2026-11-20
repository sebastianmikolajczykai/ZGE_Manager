import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { AppDatabase } from '../../../src/db.js';
import { buildApp } from '../../../src/app.js';
import { seedDemo } from '../../../src/demo/demo-seed.js';
import { OrderService } from '../../../src/modules/orders/order-service.js';
import { BoardService } from '../../../src/modules/board/board-service.js';
import { UrgencyRules, DEFAULT_URGENCY_SETTINGS } from '../../../src/modules/urgency/urgency-rules.js';
import { OfferService } from '../../../src/modules/offers/offer-service.js';
import { PaymentService } from '../../../src/modules/payments/payment-service.js';

describe('seedDemo (przykładowe dane do demo)', () => {
  let dir: string;
  let db: AppDatabase;
  const today = '2026-11-24';

  beforeEach(async () => {
    dir = mkdtempSync(path.join(tmpdir(), 'zge-'));
    db = AppDatabase.open(path.join(dir, 'zge.db'));
    db.migrate();
    await buildApp({ db, today: () => today }).close(); // wgrywa szablony i osoby
  });

  afterEach(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  const rows = () =>
    new BoardService(
      db,
      new OrderService(db, () => today),
      new UrgencyRules(DEFAULT_URGENCY_SETTINGS),
      () => today,
    ).rows();

  it('creates example orders showing every colour, marked as examples', () => {
    seedDemo(db, today);
    const board = rows();
    expect(board.length).toBeGreaterThanOrEqual(6);
    expect(new Set(board.map((r) => r.urgency.colour))).toEqual(new Set(['green', 'yellow', 'red']));
    expect(board.some((r) => r.urgency.blink)).toBe(true);
    expect(board.every((r) => r.clientName.includes('(przykład)'))).toBe(true);
  });

  it('adds example offers in every colour, marked as examples', () => {
    seedDemo(db, today);
    const offers = new OfferService(db, () => today, new UrgencyRules(DEFAULT_URGENCY_SETTINGS)).rows();
    expect(offers.length).toBeGreaterThanOrEqual(3);
    expect(new Set(offers.map((o) => o.urgency.colour))).toEqual(new Set(['green', 'yellow', 'red']));
    expect(offers.every((o) => o.clientName.includes('(przykład)'))).toBe(true);
  });

  it('adds example unpaid orders: one overdue (red) and one waiting (green)', () => {
    seedDemo(db, today);
    const rules = new UrgencyRules(DEFAULT_URGENCY_SETTINGS);
    const unpaid = new PaymentService(db, new OrderService(db, () => today), rules, () => today).rows();
    expect(unpaid.map((u) => u.urgency.colour)).toEqual(['red', 'green']);
    expect(unpaid.every((u) => u.clientName.includes('(przykład)'))).toBe(true);
  });

  it('builds a real history with the configured people', () => {
    seedDemo(db, today);
    const orders = new OrderService(db, () => today);
    const history = orders.history(orders.listActive()[0]?.id ?? 0);
    expect(history.length).toBeGreaterThan(1);
    expect(history.map((h) => h.person)).toContain('Łukasz');
  });

  it('runs only on an empty database (never touches real data)', () => {
    seedDemo(db, today);
    const count = rows().length;
    seedDemo(db, today);
    expect(rows()).toHaveLength(count);
  });
});
