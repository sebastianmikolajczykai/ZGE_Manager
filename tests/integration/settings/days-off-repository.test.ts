import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { AppDatabase } from '../../../src/db.js';
import { DaysOffRepository } from '../../../src/modules/settings/days-off-repository.js';

describe('DaysOffRepository (Ustawienia → Dni wolne firmy)', () => {
  let dir: string;
  let db: AppDatabase;
  let daysOff: DaysOffRepository;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'zge-'));
    db = AppDatabase.open(path.join(dir, 'zge.db'));
    db.migrate();
    daysOff = new DaysOffRepository(db);
  });

  afterEach(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('saves a period with a reason and who added it', () => {
    daysOff.add({ fromOn: '2026-12-28', toOn: '2026-12-31', note: 'urlop' }, 'Łukasz');
    expect(daysOff.list('2026-11-20')).toEqual([
      { id: 1, fromOn: '2026-12-28', toOn: '2026-12-31', note: 'urlop', addedBy: 'Łukasz' },
    ]);
  });

  it('an empty end date means a single day; an empty reason is allowed', () => {
    daysOff.add({ fromOn: '2026-11-17', toOn: '', note: '' }, 'Bartek');
    expect(daysOff.list('2026-11-01')[0]).toMatchObject({
      fromOn: '2026-11-17',
      toOn: '2026-11-17',
      note: null,
    });
  });

  it('lists upcoming periods by date and hides those already over', () => {
    daysOff.add({ fromOn: '2026-12-28', toOn: '2026-12-31', note: 'B' }, 'Łukasz');
    daysOff.add({ fromOn: '2026-11-02', toOn: '2026-11-03', note: 'stare' }, 'Łukasz');
    daysOff.add({ fromOn: '2026-11-19', toOn: '2026-11-23', note: 'A' }, 'Łukasz');
    expect(daysOff.list('2026-11-20').map((d) => d.note)).toEqual(['A', 'B']);
  });

  it('tells whether a date is a day off, including old periods', () => {
    daysOff.add({ fromOn: '2026-11-02', toOn: '2026-11-03', note: null }, 'Łukasz');
    const isDayOff = daysOff.checker();
    expect(isDayOff('2026-11-01')).toBe(false);
    expect(isDayOff('2026-11-02')).toBe(true);
    expect(isDayOff('2026-11-03')).toBe(true);
    expect(isDayOff('2026-11-04')).toBe(false);
  });

  it('removes a period', () => {
    daysOff.add({ fromOn: '2026-12-28', toOn: '2026-12-31', note: null }, 'Łukasz');
    daysOff.remove(1);
    expect(daysOff.list('2026-11-20')).toEqual([]);
    expect(daysOff.checker()('2026-12-29')).toBe(false);
  });

  it.each([
    [{ fromOn: '', toOn: '', note: null }, /od kiedy/],
    [{ fromOn: '2026-13-01', toOn: '', note: null }, /Nieprawidłowa data/],
    [{ fromOn: '2026-12-31', toOn: '2026-12-28', note: null }, /nie może być przed/],
    [{ fromOn: '2026-01-01', toOn: '2026-06-30', note: null }, /najwyżej 92 dni/],
  ])('rejects %o and saves nothing', (input, error) => {
    expect(() => daysOff.add(input, 'Łukasz')).toThrow(error);
    expect(daysOff.list('2000-01-01')).toEqual([]);
  });

  it('requires choosing who adds the days off', () => {
    expect(() => daysOff.add({ fromOn: '2026-12-28', toOn: '', note: null }, '')).toThrow(/Wybierz/);
  });
});
