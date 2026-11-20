import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { AppDatabase } from '../../../src/db.js';
import { WorkTypeRepository } from '../../../src/modules/work-types/work-type-repository.js';
import { WorkTypeAdmin } from '../../../src/modules/work-types/work-type-admin.js';

const step = (name: string) => ({ name, kind: 'own' as const, limitDays: 2, provisional: false });

describe('WorkTypeAdmin (Ustawienia → Rodzaje prac, z historią „kto, co, kiedy”)', () => {
  let dir: string;
  let db: AppDatabase;
  let repo: WorkTypeRepository;
  let admin: WorkTypeAdmin;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'zge-'));
    db = AppDatabase.open(path.join(dir, 'zge.db'));
    db.migrate();
    repo = new WorkTypeRepository(db);
    admin = new WorkTypeAdmin(repo, db, () => '2026-11-20');
  });

  afterEach(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('creates and changes work types, logging each change', () => {
    const id = admin.save(null, { name: 'Mapa', steps: [step('A')] }, 'Łukasz');
    admin.save(id, { name: 'Mapa do celów projektowych', steps: [step('A'), step('B')] }, 'Bartek');
    expect(repo.findById(id)?.steps).toHaveLength(2);
    expect(admin.history()).toEqual([
      {
        happenedOn: '2026-11-20',
        person: 'Bartek',
        workTypeName: 'Mapa do celów projektowych',
        action: 'changed',
      },
      { happenedOn: '2026-11-20', person: 'Łukasz', workTypeName: 'Mapa', action: 'created' },
    ]);
  });

  it('copies, hides, shows and deletes with a log entry for each', () => {
    const id = admin.save(null, { name: 'Mapa', steps: [step('A')] }, 'Łukasz');
    const copy = admin.copy(id, 'Łukasz');
    admin.setHidden(id, true, 'Marcelina');
    admin.setHidden(id, false, 'Marcelina');
    admin.remove(copy, 'Bartek');
    expect(admin.history().map((h) => `${h.person} ${h.action} ${h.workTypeName}`)).toEqual([
      'Bartek deleted Mapa (kopia)',
      'Marcelina shown Mapa',
      'Marcelina hidden Mapa',
      'Łukasz copied Mapa (kopia)',
      'Łukasz created Mapa',
    ]);
  });

  it('requires choosing a person and saves nothing without one', () => {
    expect(() => admin.save(null, { name: 'Mapa', steps: [step('A')] }, ' ')).toThrow(/Wybierz/);
    expect(repo.findAll()).toEqual([]);
  });

  it('a refused change is not logged', () => {
    const id = admin.save(null, { name: 'Mapa', steps: [step('A')] }, 'Łukasz');
    expect(() => admin.save(id, { name: 'Mapa', steps: [] }, 'Łukasz')).toThrow();
    expect(admin.history()).toHaveLength(1);
  });
});
