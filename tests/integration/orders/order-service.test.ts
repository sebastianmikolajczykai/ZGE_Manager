import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { AppDatabase } from '../../../src/db.js';
import { WorkTypeRepository } from '../../../src/modules/work-types/work-type-repository.js';
import { currentOwner, OrderService } from '../../../src/modules/orders/order-service.js';
import type { OrderInput } from '../../../src/modules/orders/order-input.js';

const PERSON = 'Osoba A';
const OTHER = 'Osoba B';

describe('OrderService', () => {
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
    plot: '123/4',
    office: null,
    pricePln: 2500,
    note: null,
    measurementOn: null,
  });

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'zge-'));
    db = AppDatabase.open(path.join(dir, 'zge.db'));
    db.migrate();
    workTypeId = new WorkTypeRepository(db).create({
      name: 'Test',
      steps: [
        { name: 'Pierwszy', kind: 'own', limitDays: 2, provisional: false },
        { name: 'Codzienny', kind: 'daily', limitDays: null, provisional: false },
        { name: 'Ostatni', kind: 'waiting', limitDays: 14, provisional: true },
      ],
    });
    today = '2026-11-16';
    service = new OrderService(db, () => today);
  });

  afterEach(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('creates an order with steps copied from the template; the first one is active', () => {
    const id = service.create(input(), PERSON);
    const order = service.get(id);
    expect(order).toMatchObject({
      clientName: 'Jan Przykładowy',
      status: 'active',
      receivedOn: '2026-11-16',
      pricePln: 2500,
    });
    expect(order?.steps.map((s) => [s.name, s.status])).toEqual([
      ['Pierwszy', 'active'],
      ['Codzienny', 'pending'],
      ['Ostatni', 'pending'],
    ]);
    expect(order?.steps[0]?.startedOn).toBe('2026-11-16');
  });

  it('stores an order without a price as "no price" (not 0 zł)', () => {
    const id = service.create({ ...input(), pricePln: null }, PERSON);
    expect(service.get(id)?.pricePln).toBeNull();
  });

  it('keeps the price exact to the grosz', () => {
    const id = service.create({ ...input(), pricePln: 1999.99 }, PERSON);
    expect(service.get(id)?.pricePln).toBe(1999.99);
  });

  it('keeps the copied steps even if the template changes later', () => {
    const id = service.create(input(), PERSON);
    db.connection.prepare("UPDATE step_templates SET name = 'Zmieniony'").run();
    expect(service.get(id)?.steps[0]?.name).toBe('Pierwszy');
  });

  it('does not require the measurement date up front (it is often agreed later)', () => {
    const withMeasurement = new WorkTypeRepository(db).create({
      name: 'Z pomiarem',
      steps: [
        { name: 'Przygotowanie', kind: 'own', limitDays: 2, provisional: false },
        { name: 'Pomiar w terenie', kind: 'scheduled', limitDays: null, provisional: false },
      ],
    });
    const base = { ...input(), workTypeId: withMeasurement };
    expect(service.get(service.create(base, PERSON))?.measurementOn).toBeNull();
    const id = service.create({ ...base, measurementOn: '2026-11-25' }, PERSON);
    expect(service.get(id)?.measurementOn).toBe('2026-11-25');
  });

  it('rejects a measurement date in the past', () => {
    expect(() => service.create({ ...input(), measurementOn: '2026-11-13' }, PERSON)).toThrow(/przeszłości/);
  });

  it('rejects an unknown work type', () => {
    expect(() => service.create({ ...input(), workTypeId: 999 }, PERSON)).toThrow(/rodzaj pracy/i);
  });

  it('rejects an action without a person', () => {
    expect(() => service.create(input(), '  ')).toThrow(/kto/i);
  });

  it('completing the active step records who/when and activates the next one', () => {
    const id = service.create(input(), PERSON);
    today = '2026-11-17';
    service.completeStep(id, 1, OTHER);
    const steps = service.get(id)?.steps ?? [];
    expect(steps[0]).toMatchObject({ status: 'done', doneOn: '2026-11-17', doneBy: OTHER });
    expect(steps[1]).toMatchObject({ status: 'active', startedOn: '2026-11-17' });
  });

  it('refuses to complete a step that is not active', () => {
    const id = service.create(input(), PERSON);
    expect(() => service.completeStep(id, 2, PERSON)).toThrow(/nie jest aktywny/);
  });

  it('completing the last step completes the order and removes it from the active list', () => {
    const id = service.create(input(), PERSON);
    [1, 2, 3].forEach((p) => service.completeStep(id, p, PERSON));
    expect(service.get(id)).toMatchObject({ status: 'completed', completedOn: '2026-11-16' });
    expect(service.listActive().map((o) => o.id)).not.toContain(id);
  });

  it('"Sprawdzone dziś" on a daily step records the check but keeps the step open', () => {
    const id = service.create(input(), PERSON);
    service.completeStep(id, 1, PERSON);
    today = '2026-11-18';
    service.checkToday(id, 2, OTHER);
    const step = service.get(id)?.steps[1];
    expect(step).toMatchObject({ status: 'active', lastCheckedOn: '2026-11-18', lastCheckedBy: OTHER });
  });

  it('refuses "Sprawdzone dziś" on a non-daily step', () => {
    const id = service.create(input(), PERSON);
    expect(() => service.checkToday(id, 1, PERSON)).toThrow(/codzienn/);
  });

  it('undo reverts the last completed step and reopens a completed order', () => {
    const id = service.create(input(), PERSON);
    [1, 2, 3].forEach((p) => service.completeStep(id, p, PERSON));
    service.undoLastStep(id, OTHER);
    const order = service.get(id);
    expect(order).toMatchObject({ status: 'active', completedOn: null });
    expect(order?.steps.map((s) => s.status)).toEqual(['done', 'done', 'active']);
    expect(order?.steps[2]).toMatchObject({ doneOn: null, doneBy: null });
  });

  it('undo puts the next step back to pending', () => {
    const id = service.create(input(), PERSON);
    service.completeStep(id, 1, PERSON);
    service.undoLastStep(id, PERSON);
    expect(service.get(id)?.steps.map((s) => s.status)).toEqual(['active', 'pending', 'pending']);
  });

  it('undo with nothing completed is refused', () => {
    const id = service.create(input(), PERSON);
    expect(() => service.undoLastStep(id, PERSON)).toThrow(/Nie ma czego cofnąć/);
  });

  it('history keeps every action with who and when, also after completion', () => {
    const id = service.create(input(), PERSON);
    service.completeStep(id, 1, OTHER);
    service.checkToday(id, 2, PERSON);
    service.undoLastStep(id, OTHER);
    expect(service.history(id).map((h) => [h.action, h.person, h.stepName])).toEqual([
      ['created', PERSON, null],
      ['step_done', OTHER, 'Pierwszy'],
      ['checked', PERSON, 'Codzienny'],
      ['undone', OTHER, 'Pierwszy'],
    ]);
  });

  it('a failed action leaves no trace (transaction)', () => {
    const id = service.create(input(), PERSON);
    expect(() => service.completeStep(id, 3, PERSON)).toThrow();
    expect(service.history(id)).toHaveLength(1);
  });

  it('refuses actions on an unknown order', () => {
    expect(() => service.completeStep(42, 1, PERSON)).toThrow(/Nie ma zlecenia/);
  });

  describe('zmiana limitu w jednym zleceniu', () => {
    it('changes the limit of the active step in this order only and logs it', () => {
      const id = service.create(input(), PERSON);
      const other = service.create(input(), PERSON);
      service.changeStepLimit(id, 1, '5', OTHER);
      expect(service.get(id)?.steps[0]).toMatchObject({ limitDays: 5, provisional: false });
      expect(service.get(other)?.steps[0]?.limitDays).toBe(2);
      expect(service.history(id).at(-1)).toMatchObject({
        person: OTHER,
        action: 'limit_changed',
        stepName: 'Pierwszy',
        note: '2 → 5 dni',
      });
    });

    it('a provisional limit becomes confirmed when changed', () => {
      const id = service.create(input(), PERSON);
      service.completeStep(id, 1, PERSON);
      service.completeStep(id, 2, PERSON);
      service.changeStepLimit(id, 3, '20', PERSON);
      expect(service.get(id)?.steps[2]).toMatchObject({ limitDays: 20, provisional: false });
    });

    it.each(['0', 'pięć', '2.5', '', '400'])('rejects the limit "%s"', (limit) => {
      const id = service.create(input(), PERSON);
      expect(() => service.changeStepLimit(id, 1, limit, PERSON)).toThrow(/od 1 do 365/);
      expect(service.get(id)?.steps[0]?.limitDays).toBe(2);
    });

    it('refuses steps without a limit, steps not active, and a missing person', () => {
      const id = service.create(input(), PERSON);
      expect(() => service.changeStepLimit(id, 3, '5', PERSON)).toThrow(/nie jest aktywny/);
      service.completeStep(id, 1, PERSON);
      expect(() => service.changeStepLimit(id, 2, '5', PERSON)).toThrow(/nie ma limitu/);
      expect(() => service.changeStepLimit(id, 2, '5', ' ')).toThrow(/Wybierz/);
    });
  });

  describe('osoba prowadząca i osoby przypisane do kroków', () => {
    const ownerOf = (id: number) => {
      const order = service.get(id);
      if (!order) throw new Error(`brak zlecenia ${id}`);
      return currentOwner(order);
    };

    it('a new order can have a lead person (optional, none by default)', () => {
      const withLead = service.create({ ...input(), leadPerson: OTHER }, PERSON);
      const without = service.create(input(), PERSON);
      expect(service.get(withLead)?.leadPerson).toBe(OTHER);
      expect(service.get(without)?.leadPerson).toBeNull();
      expect(service.get(without)?.steps.every((st) => st.assignee === null)).toBe(true);
    });

    it('the current step belongs to its assigned person, otherwise to the lead person', () => {
      const id = service.create({ ...input(), leadPerson: PERSON }, PERSON);
      expect(ownerOf(id)).toBe(PERSON);
      service.assignPeople(id, { leadPerson: PERSON, steps: { 1: OTHER } }, PERSON);
      expect(ownerOf(id)).toBe(OTHER);
      service.completeStep(id, 1, OTHER);
      expect(ownerOf(id)).toBe(PERSON);
    });

    it('nobody owns an order without a lead person and without an assigned step', () => {
      expect(ownerOf(service.create(input(), PERSON))).toBeNull();
    });

    it('people can be planned ahead for later steps and changed during the work', () => {
      const id = service.create(input(), PERSON);
      service.assignPeople(id, { leadPerson: '', steps: { 2: PERSON, 3: OTHER } }, PERSON);
      service.assignPeople(id, { leadPerson: '', steps: { 2: PERSON, 3: '' } }, OTHER);
      expect(service.get(id)?.steps.map((st) => st.assignee)).toEqual([null, PERSON, null]);
    });

    it('logs only what changed: who changed the lead person or a step, from whom to whom', () => {
      const id = service.create(input(), PERSON);
      service.assignPeople(id, { leadPerson: OTHER, steps: { 1: '', 3: PERSON } }, PERSON);
      const log = service.history(id).slice(1);
      expect(log).toHaveLength(2);
      expect(log[0]).toMatchObject({ person: PERSON, action: 'lead_changed', note: `brak → ${OTHER}` });
      expect(log[1]).toMatchObject({
        person: PERSON,
        action: 'step_assigned',
        stepName: 'Ostatni',
        note: `brak → ${PERSON}`,
      });
      service.assignPeople(id, { leadPerson: OTHER, steps: { 3: PERSON } }, PERSON);
      expect(service.history(id)).toHaveLength(3);
    });

    it('does not change steps that are already done, and needs to know who changes it', () => {
      const id = service.create(input(), PERSON);
      service.completeStep(id, 1, PERSON);
      service.assignPeople(id, { leadPerson: '', steps: { 1: OTHER } }, PERSON);
      expect(service.get(id)?.steps[0]?.assignee).toBeNull();
      expect(() => service.assignPeople(id, { leadPerson: '', steps: {} }, ' ')).toThrow(/Wybierz/);
      expect(() => service.assignPeople(99, { leadPerson: '', steps: {} }, PERSON)).toThrow(
        /Nie ma zlecenia/,
      );
    });
  });
});
