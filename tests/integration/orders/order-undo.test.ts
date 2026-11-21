import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { AppDatabase } from '../../../src/db.js';
import { WorkTypeRepository } from '../../../src/modules/work-types/work-type-repository.js';
import { OrderService } from '../../../src/modules/orders/order-service.js';

const PERSON = 'Osoba A';

/** Wartość, która w teście musi istnieć (czytelny błąd zamiast „!”). */
function required<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error('brak oczekiwanej wartości');
  return value;
}
const entryId = (entry: { id: number } | undefined) => required(entry).id;
const OTHER = 'Osoba B';

/** Cofanie z historii zlecenia: zawsze najnowszy wpis, który wciąż działa (po kolei, od góry). */
describe('OrderService: cofanie wpisu z historii', () => {
  let dir: string;
  let db: AppDatabase;
  let today: string;
  let service: OrderService;
  let id: number;

  const latestId = () => entryId(service.history(id).at(-1));
  const order = () => required(service.get(id));

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'zge-'));
    db = AppDatabase.open(path.join(dir, 'zge.db'));
    db.migrate();
    const workTypeId = new WorkTypeRepository(db).create({
      name: 'Test',
      steps: [
        { name: 'Pierwszy', kind: 'own', limitDays: 2, provisional: false },
        { name: 'Codzienny', kind: 'daily', limitDays: null, provisional: false },
        { name: 'Zapłata', kind: 'waiting', limitDays: 14, provisional: true, payment: true },
      ],
    });
    today = '2026-11-16';
    service = new OrderService(db, () => today);
    id = service.create(
      {
        clientName: 'Jan Przykładowy',
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
  });

  afterEach(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('nothing can be undone right after the order was created', () => {
    expect(service.undoableEntryId(id)).toBeNull();
  });

  it('undoes "zrobione": the step is active again and the entry is marked as undone', () => {
    service.completeStep(id, 1, PERSON);
    const entry = latestId();
    expect(service.undoableEntryId(id)).toBe(entry);

    today = '2026-11-17';
    service.undoEntry(id, entry, OTHER);

    const current = order();
    expect(current.steps.map((s) => s.status)).toEqual(['active', 'pending', 'pending']);
    expect(current.steps[0]).toMatchObject({ doneOn: null, doneBy: null });
    const history = service.history(id);
    expect(history.find((h) => h.id === entry)?.reverted).toBe(true);
    expect(history.at(-1)).toMatchObject({
      happenedOn: '2026-11-17',
      person: OTHER,
      action: 'undone',
      stepName: 'Pierwszy',
      note: 'zrobione',
    });
  });

  it('undoes "sprawdzone dziś" and brings back the previous check', () => {
    service.completeStep(id, 1, PERSON);
    service.checkToday(id, 2, PERSON);
    today = '2026-11-17';
    service.checkToday(id, 2, OTHER);

    service.undoEntry(id, latestId(), OTHER);
    expect(order().steps[1]).toMatchObject({ lastCheckedOn: '2026-11-16', lastCheckedBy: PERSON });

    service.undoEntry(id, required(service.undoableEntryId(id)), OTHER);
    expect(order().steps[1]).toMatchObject({ lastCheckedOn: null, lastCheckedBy: null });
  });

  it('undoes a call about payment (the reminder counts again from the earlier date)', () => {
    service.completeStep(id, 1, PERSON);
    service.completeStep(id, 2, PERSON);
    today = '2026-11-20';
    service.recordPaymentCall(id, PERSON, 'obiecał przelew');

    service.undoEntry(id, latestId(), PERSON);

    expect(order().steps[2]).toMatchObject({ lastCheckedOn: null, lastCheckedBy: null });
    expect(service.history(id).at(-1)?.note).toBe('przypomnienie o zapłacie');
  });

  it('undoes "Zapłacone": the order is active again and waits for payment', () => {
    service.completeStep(id, 1, PERSON);
    service.completeStep(id, 2, PERSON);
    service.completeStep(id, 3, PERSON);
    expect(order().status).toBe('completed');

    service.undoEntry(id, latestId(), PERSON);

    const current = order();
    expect(current).toMatchObject({ status: 'active', completedOn: null });
    expect(current.steps[2]?.status).toBe('active');
  });

  it('undoes a limit change (old limit and "do potwierdzenia" come back)', () => {
    service.completeStep(id, 1, PERSON);
    service.completeStep(id, 2, PERSON);
    service.changeStepLimit(id, 3, '30', PERSON);

    service.undoEntry(id, latestId(), PERSON);

    expect(order().steps[2]).toMatchObject({ limitDays: 14, provisional: true });
    expect(service.history(id).at(-1)?.note).toBe('zmiana limitu 14 → 30 dni');
  });

  it('goes back one by one: after undoing the newest entry the previous one can be undone', () => {
    service.completeStep(id, 1, PERSON);
    service.checkToday(id, 2, PERSON);
    const first = entryId(service.history(id)[1]);

    service.undoEntry(id, latestId(), PERSON);
    expect(service.undoableEntryId(id)).toBe(first);
  });

  it('refuses to undo an older entry while a newer one still works', () => {
    service.completeStep(id, 1, PERSON);
    const older = latestId();
    service.checkToday(id, 2, PERSON);

    expect(() => service.undoEntry(id, older, PERSON)).toThrow(/najpierw cofnij nowsze/i);
    expect(order().steps[0]?.status).toBe('done');
  });

  it('refuses to undo the same entry twice and entries of another order', () => {
    service.completeStep(id, 1, PERSON);
    const entry = latestId();
    service.undoEntry(id, entry, PERSON);
    expect(() => service.undoEntry(id, entry, PERSON)).toThrow();
    expect(() => service.undoEntry(id + 1, entry, PERSON)).toThrow();
  });

  it('requires a person', () => {
    service.completeStep(id, 1, PERSON);
    expect(() => service.undoEntry(id, latestId(), ' ')).toThrow();
  });

  it('undoing a step also cancels checks made on the next step (they no longer apply)', () => {
    service.completeStep(id, 1, PERSON);
    service.checkToday(id, 2, PERSON);
    const check = latestId();
    // stary przycisk „Cofnij ostatnie odhaczenie” cofa krok mimo nowszego wpisu
    service.undoLastStep(id, OTHER);

    const history = service.history(id);
    expect(history.find((h) => h.id === check)?.reverted).toBe(true);
    expect(history.filter((h) => h.action === 'step_done').every((h) => h.reverted)).toBe(true);
    expect(service.undoableEntryId(id)).toBeNull();
  });
  describe('osoby w zleceniu', () => {
    it('undoes a change of the lead person: the previous person leads again', () => {
      service.assignPeople(id, { leadPerson: PERSON, steps: {} }, PERSON);
      service.assignPeople(id, { leadPerson: OTHER, steps: {} }, PERSON);
      service.undoEntry(id, latestId(), OTHER);
      expect(order().leadPerson).toBe(PERSON);
      expect(service.history(id).at(-1)).toMatchObject({
        action: 'undone',
        person: OTHER,
        note: `osoba prowadząca: ${PERSON} → ${OTHER}`,
      });
    });

    it('undoes a person planned for a step not done yet', () => {
      service.assignPeople(id, { leadPerson: '', steps: { 3: OTHER } }, PERSON);
      service.undoEntry(id, latestId(), PERSON);
      expect(order().steps[2]?.assignee).toBeNull();
    });

    it('goes in order: "zrobione" on that step is undone first, then the person of the step', () => {
      service.assignPeople(id, { leadPerson: '', steps: { 1: OTHER } }, PERSON);
      const assigned = entryId(service.history(id).at(-1));
      service.completeStep(id, 1, OTHER);
      expect(service.undoableEntryId(id)).not.toBe(assigned);
      service.undoEntry(id, latestId(), PERSON);
      expect(service.undoableEntryId(id)).toBe(assigned);
      service.undoEntry(id, assigned, PERSON);
      expect(order().steps[0]?.assignee).toBeNull();
    });
  });
});

/** Cofanie „do tego momentu”: kliknięty wpis i wszystkie nowsze naraz, tylko w tym jednym zleceniu. */
describe('OrderService: cofanie do wybranego wpisu historii', () => {
  let dir: string;
  let db: AppDatabase;
  let service: OrderService;
  let workTypeId: number;

  const newOrder = (client: string) =>
    service.create(
      {
        clientName: client,
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
  const doneEntry = (orderId: number, position: number) =>
    entryId(service.history(orderId).find((h) => h.action === 'step_done' && h.stepPosition === position));
  const activePosition = (orderId: number) =>
    required(service.get(orderId)).steps.find((s) => s.status === 'active')?.position;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'zge-'));
    db = AppDatabase.open(path.join(dir, 'zge.db'));
    db.migrate();
    workTypeId = new WorkTypeRepository(db).create({
      name: 'Test',
      steps: [
        { name: 'Krok 1', kind: 'own', limitDays: 2, provisional: false },
        { name: 'Krok 2', kind: 'own', limitDays: 2, provisional: false },
        { name: 'Codzienny', kind: 'daily', limitDays: null, provisional: false },
        { name: 'Krok 4', kind: 'own', limitDays: 2, provisional: false },
        { name: 'Zapłata', kind: 'waiting', limitDays: 14, provisional: true, payment: true },
      ],
    });
    service = new OrderService(db, () => '2026-11-16');
  });

  afterEach(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('lists every entry that can be reached by undoing, newest first', () => {
    const id = newOrder('Jan Przykładowy');
    service.completeStep(id, 1, PERSON);
    service.completeStep(id, 2, PERSON);
    service.checkToday(id, 3, PERSON);
    const [, step1, step2, check] = service.history(id).map((h) => h.id);

    expect(service.undoableEntryIds(id)).toEqual([check, step2, step1]);
    expect(service.undoableEntryId(id)).toBe(check);
  });

  it('listing what can be undone changes nothing in the order', () => {
    const id = newOrder('Jan Przykładowy');
    service.completeStep(id, 1, PERSON);
    service.completeStep(id, 2, PERSON);
    const before = { order: service.get(id), history: service.history(id) };

    service.undoableEntryIds(id);

    expect({ order: service.get(id), history: service.history(id) }).toEqual(before);
  });

  it('goes back from step 5 to step 2: the clicked entry and all newer ones are undone at once', () => {
    const id = newOrder('Jan Przykładowy');
    for (const position of [1, 2, 3, 4]) service.completeStep(id, position, PERSON);
    expect(activePosition(id)).toBe(5);

    const undone = service.undoBackTo(id, doneEntry(id, 2), OTHER);

    expect(undone).toBe(3);
    expect(activePosition(id)).toBe(2);
    expect(required(service.get(id)).steps.map((s) => s.status)).toEqual([
      'done',
      'active',
      'pending',
      'pending',
      'pending',
    ]);
    const history = service.history(id);
    expect(history.filter((h) => h.action === 'step_done' && h.reverted).map((h) => h.stepPosition)).toEqual([
      2, 3, 4,
    ]);
    expect(history.filter((h) => h.action === 'undone' && h.person === OTHER)).toHaveLength(3);
  });

  it('brings a paid order back to "waiting for payment"', () => {
    const id = newOrder('Jan Przykładowy');
    for (const position of [1, 2, 3, 4, 5]) service.completeStep(id, position, PERSON);
    expect(required(service.get(id)).status).toBe('completed');

    service.undoBackTo(id, doneEntry(id, 4), PERSON);

    expect(required(service.get(id)).status).toBe('active');
    expect(activePosition(id)).toBe(4);
  });

  it('does not touch other orders, which can still be undone later', () => {
    const id = newOrder('Jan Przykładowy');
    const other = newOrder('Anna Przykładowa');
    service.completeStep(other, 1, PERSON);
    service.completeStep(id, 1, PERSON);
    service.completeStep(other, 2, PERSON);
    service.completeStep(id, 2, PERSON);
    const otherBefore = service.get(other);

    service.undoBackTo(id, doneEntry(id, 1), PERSON);

    expect(activePosition(id)).toBe(1);
    expect(service.get(other)).toEqual(otherBefore);
    expect(service.undoableEntryIds(other)).toEqual([doneEntry(other, 2), doneEntry(other, 1)]);
  });

  it('works like a normal undo for the newest entry', () => {
    const id = newOrder('Jan Przykładowy');
    service.completeStep(id, 1, PERSON);

    expect(service.undoBackTo(id, doneEntry(id, 1), PERSON)).toBe(1);
    expect(activePosition(id)).toBe(1);
  });

  it('refuses entries that cannot be reached and changes nothing', () => {
    const id = newOrder('Jan Przykładowy');
    const other = newOrder('Anna Przykładowa');
    service.completeStep(id, 1, PERSON);
    service.completeStep(other, 1, PERSON);
    const created = entryId(service.history(id)[0]);
    const before = service.history(id);

    expect(() => service.undoBackTo(id, created, PERSON)).toThrow(/nie można cofnąć/i);
    expect(() => service.undoBackTo(id, doneEntry(other, 1), PERSON)).toThrow(/nie można cofnąć/i);
    expect(service.history(id)).toEqual(before);
  });

  it('requires a person', () => {
    const id = newOrder('Jan Przykładowy');
    service.completeStep(id, 1, PERSON);
    expect(() => service.undoBackTo(id, doneEntry(id, 1), ' ')).toThrow();
    expect(activePosition(id)).toBe(2);
  });
});

describe('OrderService: usuwanie zlecenia przy cofnięciu przyjęcia oferty', () => {
  let dir: string;
  let db: AppDatabase;
  let service: OrderService;
  let id: number;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'zge-'));
    db = AppDatabase.open(path.join(dir, 'zge.db'));
    db.migrate();
    const workTypeId = new WorkTypeRepository(db).create({
      name: 'Test',
      steps: [
        { name: 'Pierwszy', kind: 'own', limitDays: 2, provisional: false },
        { name: 'Drugi', kind: 'own', limitDays: 2, provisional: false },
      ],
    });
    service = new OrderService(db, () => '2026-11-16');
    id = service.create(
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
  });

  afterEach(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('deletes an order in which nothing was done yet (with its steps and history)', () => {
    service.deleteUntouched(id);
    expect(service.get(id)).toBeNull();
    expect(service.history(id)).toEqual([]);
  });

  it('refuses when a step was already done', () => {
    service.completeStep(id, 1, PERSON);
    expect(() => service.deleteUntouched(id)).toThrow(/odhaczono już krok/);
    expect(service.get(id)).not.toBeNull();
  });
});
