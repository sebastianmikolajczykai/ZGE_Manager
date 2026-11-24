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
      hidden: false,
      steps: [
        {
          position: 1,
          name: 'Pierwszy',
          kind: 'own',
          limitDays: 2,
          provisional: false,
          payment: false,
          parallel: false,
        },
        {
          position: 2,
          name: 'Drugi',
          kind: 'waiting',
          limitDays: null,
          provisional: true,
          payment: false,
          parallel: false,
        },
      ],
    });
  });

  it('stores and reads back the payment flag', () => {
    const id = repo.create({
      name: 'Z zapłatą',
      steps: [
        { name: 'Robota', kind: 'own', limitDays: 2, provisional: false },
        { name: 'Zapłata', kind: 'waiting', limitDays: 14, provisional: true, payment: true },
      ],
    });
    expect(repo.findById(id)?.steps.map((st) => st.payment)).toEqual([false, true]);
  });

  it('stores the parallel mark and keeps it in a copy', () => {
    const id = repo.create({
      name: 'Równoległy',
      steps: [
        { name: 'Termin', kind: 'own', limitDays: 2, provisional: false },
        { name: 'Analiza', kind: 'own', limitDays: 2, provisional: false, parallel: true },
      ],
    });
    expect(repo.findById(id)?.steps.map((s) => s.parallel)).toEqual([false, true]);
    expect(repo.findById(repo.copy(id))?.steps.map((s) => s.parallel)).toEqual([false, true]);
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

  describe('edycja w Ustawieniach', () => {
    const one = (name: string) => ({ name, kind: 'own' as const, limitDays: 2, provisional: false });

    it('does not bring back a renamed default template after a restart', () => {
      repo.seedDefaults(DEFAULT_WORK_TYPES);
      const id = repo.findAll()[0]?.id ?? 0;
      repo.update(id, { name: 'Podział (nasz)', steps: [one('A')] });
      repo.seedDefaults(DEFAULT_WORK_TYPES);
      expect(repo.findAll().map((w) => w.name)).toEqual(['Podział (nasz)']);
    });

    it('updates the name and replaces the steps in the new order', () => {
      const id = repo.create({ name: 'Mapa', steps: [one('A'), one('B')] });
      repo.update(id, { name: 'Mapa do celów projektowych', steps: [one('B'), one('A'), one('C')] });
      const saved = repo.findById(id);
      expect(saved?.name).toBe('Mapa do celów projektowych');
      expect(saved?.steps.map((s) => `${s.position}.${s.name}`)).toEqual(['1.B', '2.A', '3.C']);
    });

    it('refuses an invalid update and keeps the old version', () => {
      const id = repo.create({ name: 'Mapa', steps: [one('A')] });
      expect(() => repo.update(id, { name: 'Mapa', steps: [] })).toThrow(/co najmniej jeden krok/);
      expect(repo.findById(id)?.steps.map((s) => s.name)).toEqual(['A']);
    });

    it('refuses a name already used by another work type', () => {
      repo.create({ name: 'Mapa', steps: [one('A')] });
      const id = repo.create({ name: 'Granice', steps: [one('A')] });
      expect(() => repo.update(id, { name: ' mapa ', steps: [one('A')] })).toThrow(/już istnieje/);
    });

    it('refuses to update an unknown work type', () => {
      expect(() => repo.update(999, { name: 'X', steps: [one('A')] })).toThrow(/Nie ma rodzaju pracy/);
    });

    it('copies a work type under a free "(kopia)" name', () => {
      const id = repo.create({ name: 'Mapa', steps: [one('A'), one('B')] });
      const first = repo.copy(id);
      const second = repo.copy(id);
      expect(repo.findById(first)?.name).toBe('Mapa (kopia)');
      expect(repo.findById(second)?.name).toBe('Mapa (kopia 2)');
      expect(repo.findById(first)?.steps.map((s) => s.name)).toEqual(['A', 'B']);
    });

    it('hides a work type from new orders and shows it again', () => {
      const id = repo.create({ name: 'Mapa', steps: [one('A')] });
      repo.create({ name: 'Granice', steps: [one('A')] });
      repo.setHidden(id, true);
      expect(repo.findActive().map((w) => w.name)).toEqual(['Granice']);
      expect(repo.findById(id)?.hidden).toBe(true);
      repo.setHidden(id, false);
      expect(repo.findActive().map((w) => w.name)).toEqual(['Mapa', 'Granice']);
    });

    it('deletes an unused work type, but refuses when orders or offers use it', () => {
      const unused = repo.create({ name: 'Mapa', steps: [one('A')] });
      const used = repo.create({ name: 'Granice', steps: [one('A')] });
      db.connection
        .prepare(
          "INSERT INTO orders (client_name, phone, town, work_type_id, received_on) VALUES ('K', '600100200', 'M', ?, '2026-11-20')",
        )
        .run(used);
      repo.remove(unused);
      expect(repo.findById(unused)).toBeNull();
      expect(repo.usage(used)).toBe(1);
      expect(() => repo.remove(used)).toThrow(/używany w 1 zleceniu lub ofercie.*ukryć/);
    });
  });
});
