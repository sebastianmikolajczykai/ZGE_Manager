import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { AppDatabase } from '../../../src/db.js';
import { WorkTypeRepository } from '../../../src/modules/work-types/work-type-repository.js';
import { OrderService } from '../../../src/modules/orders/order-service.js';

const PERSON = 'Osoba A';
const OTHER = 'Osoba B';

/** Data pomiaru: opcjonalna przy przyjęciu, dopisywana później (z historią i cofaniem). */
describe('OrderService: data pomiaru do uzupełnienia później', () => {
  let dir: string;
  let db: AppDatabase;
  let today: string;
  let service: OrderService;
  let id: number;

  const order = () => {
    const o = service.get(id);
    if (!o) throw new Error('brak zlecenia');
    return o;
  };
  const latest = () => service.history(id).at(-1);

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'zge-'));
    db = AppDatabase.open(path.join(dir, 'zge.db'));
    db.migrate();
    const workTypeId = new WorkTypeRepository(db).create({
      name: 'Z pomiarem',
      steps: [
        { name: 'Ustalenie terminu pomiaru', kind: 'own', limitDays: 2, provisional: false },
        { name: 'Pomiar w terenie', kind: 'scheduled', limitDays: null, provisional: false },
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

  it('accepts an order with a measurement step but no date yet', () => {
    expect(order().measurementOn).toBeNull();
  });

  it('sets the date later and writes "brak → date" to the history', () => {
    service.setMeasurementDate(id, '2026-11-25', OTHER);
    expect(order().measurementOn).toBe('2026-11-25');
    expect(latest()).toMatchObject({
      person: OTHER,
      action: 'measurement_set',
      note: 'brak → 25.11.2026',
      reverted: false,
    });
  });

  it('changes an existing date (the office moved the appointment)', () => {
    service.setMeasurementDate(id, '2026-11-25', PERSON);
    service.setMeasurementDate(id, '2026-11-27', OTHER);
    expect(order().measurementOn).toBe('2026-11-27');
    expect(latest()?.note).toBe('25.11.2026 → 27.11.2026');
  });

  it('allows today as the measurement date', () => {
    service.setMeasurementDate(id, '2026-11-16', PERSON);
    expect(order().measurementOn).toBe('2026-11-16');
  });

  it.each([
    ['', /datę pomiaru/],
    ['16.11.2026', /Nieprawidłowa data pomiaru/],
    ['2026-02-30', /Nieprawidłowa data pomiaru/],
    ['2026-11-13', /przeszłości/],
  ])('rejects the date "%s"', (date, error) => {
    expect(() => service.setMeasurementDate(id, date, PERSON)).toThrow(error);
    expect(order().measurementOn).toBeNull();
  });

  it('rejects the same date again (nothing would change)', () => {
    service.setMeasurementDate(id, '2026-11-25', PERSON);
    expect(() => service.setMeasurementDate(id, '2026-11-25', PERSON)).toThrow(/ta sama/);
  });

  it('rejects setting the date without a person, for an unknown or finished order', () => {
    expect(() => service.setMeasurementDate(id, '2026-11-25', ' ')).toThrow(/kto/i);
    expect(() => service.setMeasurementDate(999, '2026-11-25', PERSON)).toThrow(/Nie ma zlecenia/);
    service.completeStep(id, 1, PERSON);
    service.completeStep(id, 2, PERSON);
    expect(() => service.setMeasurementDate(id, '2026-11-25', PERSON)).toThrow(/zakończone/);
  });

  it('undoes setting the date from the history (back to "no date")', () => {
    service.setMeasurementDate(id, '2026-11-25', PERSON);
    const entry = latest()?.id ?? 0;
    expect(service.undoableEntryId(id)).toBe(entry);

    service.undoEntry(id, entry, OTHER);

    expect(order().measurementOn).toBeNull();
    expect(service.history(id).find((h) => h.id === entry)?.reverted).toBe(true);
    expect(latest()).toMatchObject({
      person: OTHER,
      action: 'undone',
      note: 'data pomiaru brak → 25.11.2026',
    });
  });

  it('undoing a changed date brings back the previous date', () => {
    service.setMeasurementDate(id, '2026-11-25', PERSON);
    service.setMeasurementDate(id, '2026-11-27', PERSON);
    service.undoEntry(id, latest()?.id ?? 0, OTHER);
    expect(order().measurementOn).toBe('2026-11-25');
  });

  it('undoes newest first: a step ticked after setting the date must be undone before the date', () => {
    service.setMeasurementDate(id, '2026-11-25', PERSON);
    const dateEntry = latest()?.id ?? 0;
    service.completeStep(id, 1, PERSON);
    expect(() => service.undoEntry(id, dateEntry, PERSON)).toThrow(/Najpierw cofnij nowsze/);
    service.undoEntry(id, service.undoableEntryId(id) ?? 0, PERSON);
    expect(service.undoableEntryId(id)).toBe(dateEntry);
  });
});
