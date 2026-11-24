import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { AppDatabase } from '../../../src/db.js';
import { WorkTypeRepository } from '../../../src/modules/work-types/work-type-repository.js';
import { currentOwners, OrderService } from '../../../src/modules/orders/order-service.js';
import type { OrderInput } from '../../../src/modules/orders/order-input.js';

const LUKASZ = 'Łukasz';
const BARTEK = 'Bartek';

/** Kroki równoległe: dwa kroki startują tego samego dnia, każdy odhaczany osobno. */
describe('OrderService: kroki równoległe', () => {
  let dir: string;
  let db: AppDatabase;
  let today: string;
  let service: OrderService;
  let workTypeId: number;

  const input = (): OrderInput => ({
    clientName: 'Jan Przykładowy',
    phone: '600 100 200',
    town: 'Przykładowo',
    workTypeId,
    plot: null,
    office: null,
    pricePln: null,
    note: null,
    measurementOn: null,
    leadPerson: LUKASZ,
  });
  const statuses = (id: number) => service.get(id)?.steps.map((s) => s.status);
  const doneEntry = (id: number, position: number) =>
    [...service.history(id)].reverse().find((h) => h.action === 'step_done' && h.stepPosition === position)
      ?.id ?? -1;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'zge-'));
    db = AppDatabase.open(path.join(dir, 'zge.db'));
    db.migrate();
    workTypeId = new WorkTypeRepository(db).create({
      name: 'Podział',
      steps: [
        { name: 'Ustalenie terminu pomiaru', kind: 'own', limitDays: 2, provisional: false },
        { name: 'Analiza materiałów', kind: 'own', limitDays: 2, provisional: false, parallel: true },
        { name: 'Wysłanie zawiadomień', kind: 'own', limitDays: 2, provisional: false },
        { name: 'Projekt', kind: 'own', limitDays: 5, provisional: false },
      ],
    });
    today = '2026-11-16';
    service = new OrderService(db, () => today);
  });

  afterEach(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('a new order starts both parallel steps on the same day 0', () => {
    const id = service.create(input(), LUKASZ);
    const steps = service.get(id)?.steps ?? [];
    expect(steps.map((s) => [s.status, s.startedOn, s.parallel])).toEqual([
      ['active', '2026-11-16', false],
      ['active', '2026-11-16', true],
      ['pending', null, false],
      ['pending', null, false],
    ]);
  });

  it('ticking one parallel step keeps the other active and does not start the next step', () => {
    const id = service.create(input(), LUKASZ);
    today = '2026-11-17';
    service.completeStep(id, 1, LUKASZ);
    expect(statuses(id)).toEqual(['done', 'active', 'pending', 'pending']);
  });

  it('the next step starts only when all parallel steps are ticked (in any order), counting from that day', () => {
    const id = service.create(input(), LUKASZ);
    today = '2026-11-17';
    service.completeStep(id, 2, BARTEK);
    today = '2026-11-18';
    service.completeStep(id, 1, LUKASZ);
    const steps = service.get(id)?.steps ?? [];
    expect(steps.map((s) => s.status)).toEqual(['done', 'done', 'active', 'pending']);
    expect(steps[2]?.startedOn).toBe('2026-11-18');
    expect(steps.slice(0, 2).map((s) => s.doneBy)).toEqual([LUKASZ, BARTEK]);
  });

  it('the limit of one parallel step can be changed without touching the other', () => {
    const id = service.create(input(), LUKASZ);
    service.changeStepLimit(id, 2, '4', BARTEK);
    expect(
      service
        .get(id)
        ?.steps.slice(0, 2)
        .map((s) => s.limitDays),
    ).toEqual([2, 4]);
  });

  it('lists the owners of all running parallel steps (filter „Moje”)', () => {
    const id = service.create(input(), LUKASZ);
    service.assignPeople(id, { leadPerson: LUKASZ, steps: { 2: BARTEK } }, LUKASZ);
    const order = service.get(id);
    expect(order && currentOwners(order)).toEqual([LUKASZ, BARTEK]);
    service.completeStep(id, 2, BARTEK);
    const after = service.get(id);
    expect(after && currentOwners(after)).toEqual([LUKASZ]);
  });

  it('undoing one parallel step while the other is still open only reopens that step', () => {
    const id = service.create(input(), LUKASZ);
    service.completeStep(id, 2, BARTEK);
    service.undoEntry(id, doneEntry(id, 2), BARTEK);
    expect(statuses(id)).toEqual(['active', 'active', 'pending', 'pending']);
  });

  it('undoing the last ticked parallel step stops the next step again', () => {
    const id = service.create(input(), LUKASZ);
    service.completeStep(id, 2, BARTEK);
    service.completeStep(id, 1, LUKASZ);
    service.undoEntry(id, doneEntry(id, 1), LUKASZ);
    const steps = service.get(id)?.steps ?? [];
    expect(steps.map((s) => s.status)).toEqual(['active', 'done', 'pending', 'pending']);
    expect(steps[2]?.startedOn).toBeNull();
  });

  it('the whole group can be undone step by step back to the start', () => {
    const id = service.create(input(), LUKASZ);
    service.completeStep(id, 1, LUKASZ);
    service.completeStep(id, 2, BARTEK);
    service.completeStep(id, 3, LUKASZ);
    const undone = service.undoBackTo(id, doneEntry(id, 1), LUKASZ);
    expect(undone).toBe(3);
    expect(statuses(id)).toEqual(['active', 'active', 'pending', 'pending']);
  });

  it('„Cofnij ostatni krok” reopens a ticked parallel step without stopping the other one', () => {
    const id = service.create(input(), LUKASZ);
    service.completeStep(id, 1, LUKASZ);
    service.undoLastStep(id, LUKASZ);
    expect(statuses(id)).toEqual(['active', 'active', 'pending', 'pending']);
  });

  it('a step that is not running yet cannot be ticked', () => {
    const id = service.create(input(), LUKASZ);
    expect(() => service.completeStep(id, 3, LUKASZ)).toThrow(/nie jest aktywny/);
  });

  it('old orders without parallel steps work exactly as before (one step after another)', () => {
    const seqId = new WorkTypeRepository(db).create({
      name: 'Zwykły',
      steps: [
        { name: 'A', kind: 'own', limitDays: 2, provisional: false },
        { name: 'B', kind: 'own', limitDays: 2, provisional: false },
      ],
    });
    const id = service.create({ ...input(), workTypeId: seqId }, LUKASZ);
    expect(statuses(id)).toEqual(['active', 'pending']);
    service.completeStep(id, 1, LUKASZ);
    expect(statuses(id)).toEqual(['done', 'active']);
    service.completeStep(id, 2, LUKASZ);
    expect(service.get(id)?.status).toBe('completed');
  });

  it('an order whose last steps run in parallel is completed when both are ticked', () => {
    const endId = new WorkTypeRepository(db).create({
      name: 'Koniec równoległy',
      steps: [
        { name: 'A', kind: 'own', limitDays: 2, provisional: false },
        { name: 'B', kind: 'own', limitDays: 2, provisional: false, parallel: true },
      ],
    });
    const id = service.create({ ...input(), workTypeId: endId }, LUKASZ);
    service.completeStep(id, 1, LUKASZ);
    expect(service.get(id)?.status).toBe('active');
    service.completeStep(id, 2, BARTEK);
    expect(service.get(id)?.status).toBe('completed');
    service.undoLastStep(id, BARTEK);
    expect(service.get(id)?.status).toBe('active');
    expect(statuses(id)).toEqual(['done', 'active']);
  });
});
