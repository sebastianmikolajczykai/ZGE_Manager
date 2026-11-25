import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { AppDatabase } from '../../../src/db.js';
import { WorkTypeRepository } from '../../../src/modules/work-types/work-type-repository.js';
import { OrderService } from '../../../src/modules/orders/order-service.js';

const PERSON = 'Osoba A';

/** Numer zlecenia nadawany w biurze (np. „125 podział”): przy dodawaniu albo później z karty, z historią i cofaniem. */
describe('OrderService: numer zlecenia', () => {
  let dir: string;
  let db: AppDatabase;
  let service: OrderService;
  let workTypeId: number;

  const newOrder = (orderNumber?: string | null) =>
    service.create(
      {
        clientName: 'Jan Przykładowy',
        phone: '600 100 200',
        town: 'Przykładowo',
        workTypeId,
        plot: null,
        office: null,
        pricePln: null,
        note: null,
        measurementOn: null,
        orderNumber,
      },
      PERSON,
    );

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'zge-'));
    db = AppDatabase.open(path.join(dir, 'zge.db'));
    db.migrate();
    workTypeId = new WorkTypeRepository(db).create({
      name: 'Prosty',
      steps: [{ name: 'Krok', kind: 'own', limitDays: 2, provisional: false }],
    });
    service = new OrderService(db, () => '2026-11-24');
  });

  afterEach(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('saves the number given when the order is added', () => {
    const id = newOrder(' 125 podział ');
    expect(service.get(id)?.orderNumber).toBe('125 podział');
  });

  it('keeps orders without a number (older orders) as null', () => {
    const id = newOrder();
    expect(service.get(id)?.orderNumber).toBeNull();
    expect(service.listActive()[0]?.orderNumber).toBeNull();
  });

  it('sets the number later from the card and writes who did it to history', () => {
    const id = newOrder();
    service.setOrderNumber(id, '126 syt wys', 'Osoba B');
    expect(service.get(id)?.orderNumber).toBe('126 syt wys');
    expect(service.history(id).at(-1)).toMatchObject({
      person: 'Osoba B',
      action: 'number_set',
      note: 'brak → 126 syt wys',
    });
  });

  it('clears the number when an empty value is saved', () => {
    const id = newOrder('127 okaz');
    service.setOrderNumber(id, '  ', PERSON);
    expect(service.get(id)?.orderNumber).toBeNull();
    expect(service.history(id).at(-1)?.note).toBe('127 okaz → brak');
  });

  it('refuses a change that changes nothing', () => {
    const id = newOrder('125');
    expect(() => service.setOrderNumber(id, ' 125 ', PERSON)).toThrow(/ten sam numer/);
  });

  it('refuses a too long number and an unknown order', () => {
    const id = newOrder();
    expect(() => service.setOrderNumber(id, 'x'.repeat(41), PERSON)).toThrow(/Numer zlecenia/);
    expect(() => service.setOrderNumber(999, '1', PERSON)).toThrow(/999/);
  });

  it('requires the person who changes it', () => {
    const id = newOrder();
    expect(() => service.setOrderNumber(id, '1', ' ')).toThrow(/kto/);
  });

  it('undoes the number change (previous number comes back, entry crossed out)', () => {
    const id = newOrder('125');
    service.setOrderNumber(id, '125 podział', PERSON);
    const entryId = service.undoableEntryId(id) as number;
    service.undoEntry(id, entryId, 'Osoba B');
    expect(service.get(id)?.orderNumber).toBe('125');
    const history = service.history(id);
    expect(history.find((h) => h.id === entryId)?.reverted).toBe(true);
    expect(history.at(-1)).toMatchObject({ action: 'undone', stepName: null });
  });
});
