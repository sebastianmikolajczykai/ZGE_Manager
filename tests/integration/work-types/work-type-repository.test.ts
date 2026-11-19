import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { AppDatabase } from '../../../src/db.js';
import { WorkTypeRepository } from '../../../src/modules/work-types/work-type-repository.js';
import { DEFAULT_WORK_TYPES } from '../../../src/modules/work-types/default-work-types.js';

describe('WorkTypeRepository', () => {
  let dir: string;
  let db: AppDatabase;
  let repo: WorkTypeRepository;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'zge-'));
    db = AppDatabase.open(path.join(dir, 'zge.db'));
    db.migrate();
    repo = new WorkTypeRepository(db);
  });

  afterEach(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('saves a work type and reads it back with steps in order', () => {
    const id = repo.create({
      name: 'Mapa',
      steps: [
        { name: 'Pierwszy', kind: 'own', limitDays: 2, provisional: false },
        { name: 'Drugi', kind: 'waiting', limitDays: null, provisional: true },
      ],
    });
    expect(repo.findById(id)).toEqual({
      id,
      name: 'Mapa',
      steps: [
        { position: 1, name: 'Pierwszy', kind: 'own', limitDays: 2, provisional: false },
        { position: 2, name: 'Drugi', kind: 'waiting', limitDays: null, provisional: true },
      ],
    });
  });

  it('returns null for an unknown id', () => {
    expect(repo.findById(999)).toBeNull();
  });

  it('rejects an invalid definition without writing anything', () => {
    expect(() => repo.create({ name: '', steps: [] })).toThrow();
    expect(repo.findAll()).toEqual([]);
  });

  it('rejects a second work type with the same name', () => {
    repo.create({ name: 'Mapa', steps: [{ name: 'A', kind: 'own', limitDays: 1, provisional: false }] });
    expect(() =>
      repo.create({ name: 'Mapa', steps: [{ name: 'B', kind: 'own', limitDays: 1, provisional: false }] }),
    ).toThrow(/już istnieje/);
  });

  it('seeds default templates once, even when run again (e.g. after every app start)', () => {
    repo.seedDefaults(DEFAULT_WORK_TYPES);
    repo.seedDefaults(DEFAULT_WORK_TYPES);
    const all = repo.findAll();
    expect(all.map((w) => w.name)).toEqual(DEFAULT_WORK_TYPES.map((w) => w.name));
    expect(all[0]?.steps).toHaveLength(13);
  });

  it('the database refuses an unknown step kind', () => {
    expect(() =>
      db.connection.exec(
        "INSERT INTO work_types (name) VALUES ('X'); INSERT INTO step_templates (work_type_id, position, name, kind) VALUES (last_insert_rowid(), 1, 'A', 'bad');",
      ),
    ).toThrow(/CHECK/);
  });
});
