import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { AppDatabase } from '../../../src/db.js';
import { WorkTypeRepository } from '../../../src/modules/work-types/work-type-repository.js';
import { OrderService } from '../../../src/modules/orders/order-service.js';
import { BoardService } from '../../../src/modules/board/board-service.js';
import { UrgencyRules, DEFAULT_URGENCY_SETTINGS } from '../../../src/modules/urgency/urgency-rules.js';
import type { OrderInput } from '../../../src/modules/orders/order-input.js';

describe('BoardService: rows for the "Na dziś" board', () => {
  let dir: string;
  let db: AppDatabase;
  let today: string;
  let orders: OrderService;
  let board: BoardService;
  let workTypeId: number;

  const order = (clientName: string, extra: Partial<OrderInput> = {}): OrderInput => ({
    clientName,
    phone: '600100200',
    town: 'Przykładowo',
    workTypeId,
    plot: '12/3',
    office: null,
    pricePln: 1000,
    note: null,
    measurementOn: '2026-11-30',
    ...extra,
  });

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'zge-'));
    db = AppDatabase.open(path.join(dir, 'zge.db'));
    db.migrate();
    workTypeId = new WorkTypeRepository(db).create({
      name: 'Podział',
      steps: [
        { name: 'Ustalenie terminu', kind: 'own', limitDays: 2, provisional: false },
        { name: 'Śledzenie poczty', kind: 'daily', limitDays: null, provisional: false },
        { name: 'Pomiar w terenie', kind: 'scheduled', limitDays: null, provisional: false },
      ],
    });
    today = '2026-11-16'; // poniedziałek
    orders = new OrderService(db, () => today);
    board = new BoardService(db, orders, new UrgencyRules(DEFAULT_URGENCY_SETTINGS), () => today);
  });

  afterEach(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('each row knows who the current step belongs to (assigned person or lead person)', () => {
    const id = orders.create(order('Jan', { leadPerson: 'Anna' }), 'Anna');
    orders.create(order('Ewa'), 'Anna');
    expect(board.rows().map((r) => r.owner)).toEqual(['Anna', null]);
    orders.assignPeople(id, { leadPerson: 'Anna', steps: { 1: 'Piotr' } }, 'Anna');
    expect(board.rows()[0]?.owner).toBe('Piotr');
  });

  it('shows one row per active order with its current step and details', () => {
    orders.create(order('Jan'), 'Anna');
    const [row] = board.rows();
    expect(row).toMatchObject({
      clientName: 'Jan',
      town: 'Przykładowo',
      plot: '12/3',
      workTypeName: 'Podział',
      currentStepName: 'Ustalenie terminu',
      daysOnStep: 0,
      lastPerson: 'Anna',
      pricePln: 1000,
      urgency: { colour: 'green' },
    });
  });

  it('colours an own step by its limit (day 1 yellow, day 2 red)', () => {
    orders.create(order('Jan'), 'Anna');
    today = '2026-11-17';
    expect(board.rows()[0]?.urgency.colour).toBe('yellow');
    today = '2026-11-18';
    expect(board.rows()[0]?.urgency.colour).toBe('red');
  });

  it('colours a daily step by the last check', () => {
    const id = orders.create(order('Jan'), 'Anna');
    orders.completeStep(id, 1, 'Anna');
    today = '2026-11-17';
    expect(board.rows()[0]?.urgency.colour).toBe('yellow');
    orders.checkToday(id, 2, 'Piotr');
    expect(board.rows()[0]).toMatchObject({ urgency: { colour: 'green' }, lastPerson: 'Piotr' });
  });

  it('colours the measurement step by the measurement date', () => {
    const id = orders.create(order('Jan', { measurementOn: '2026-11-18' }), 'Anna');
    orders.completeStep(id, 1, 'Anna');
    orders.completeStep(id, 2, 'Anna');
    expect(board.rows()[0]?.urgency.colour).toBe('green');
    today = '2026-11-18';
    expect(board.rows()[0]?.urgency.colour).toBe('yellow');
    today = '2026-11-19';
    expect(board.rows()[0]?.urgency.colour).toBe('red');
  });

  it('sorts the most urgent first and hides completed orders', () => {
    orders.create(order('Stary'), 'Anna');
    today = '2026-11-18';
    orders.create(order('Nowy'), 'Anna');
    const done = orders.create(order('Gotowy'), 'Anna');
    [1, 2, 3].forEach((p) => orders.completeStep(done, p, 'Anna'));
    expect(board.rows().map((r) => r.clientName)).toEqual(['Stary', 'Nowy']);
  });
});
