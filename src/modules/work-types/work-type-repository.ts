import type { AppDatabase } from '../../db.js';
import {
  validateWorkType,
  type StepKind,
  type StepTemplate,
  type WorkTypeDefinition,
} from './work-type-definition.js';

export interface StoredStep extends StepTemplate {
  position: number;
  payment: boolean;
}

export interface WorkType {
  id: number;
  name: string;
  /** Ukryty = nie ma go na liście przy nowym zleceniu/ofercie; stare zlecenia działają dalej. */
  hidden: boolean;
  steps: StoredStep[];
}

interface WorkTypeRow {
  id: number;
  name: string;
  hidden: number;
}

interface StepRow {
  position: number;
  name: string;
  kind: StepKind;
  limit_days: number | null;
  provisional: number;
  payment: number;
}

/** Zapis i odczyt rodzajów prac oraz ich kroków w bazie. */
export class WorkTypeRepository {
  constructor(private readonly db: AppDatabase) {}

  /** Zapisuje nowy rodzaj pracy w jednej transakcji; zwraca jego id. */
  create(def: WorkTypeDefinition): number {
    validateWorkType(def);
    this.requireFreeName(def.name, null);
    const conn = this.db.connection;
    return conn.transaction(() => {
      const id = Number(
        conn.prepare('INSERT INTO work_types (name) VALUES (?)').run(def.name.trim()).lastInsertRowid,
      );
      this.insertSteps(id, def);
      return id;
    })();
  }

  /** Zmienia nazwę i kroki. Zlecenia mają własną kopię kroków, więc zmiana dotyczy tylko nowych zleceń. */
  update(id: number, def: WorkTypeDefinition): void {
    this.require(id);
    validateWorkType(def);
    this.requireFreeName(def.name, id);
    const conn = this.db.connection;
    conn.transaction(() => {
      conn.prepare('UPDATE work_types SET name = ? WHERE id = ?').run(def.name.trim(), id);
      conn.prepare('DELETE FROM step_templates WHERE work_type_id = ?').run(id);
      this.insertSteps(id, def);
    })();
  }

  /** Kopia pod wolną nazwą „X (kopia)”, „X (kopia 2)”…; zwraca id kopii. */
  copy(id: number): number {
    const source = this.require(id);
    let name = `${source.name} (kopia)`;
    for (let n = 2; this.findIdByName(name) !== null; n++) name = `${source.name} (kopia ${n})`;
    return this.create({ name, steps: source.steps });
  }

  setHidden(id: number, hidden: boolean): void {
    this.require(id);
    this.db.connection.prepare('UPDATE work_types SET hidden = ? WHERE id = ?').run(hidden ? 1 : 0, id);
  }

  /** W ilu zleceniach i ofertach użyto tego rodzaju pracy. */
  usage(id: number): number {
    const row = this.db.connection
      .prepare(
        'SELECT (SELECT COUNT(*) FROM orders WHERE work_type_id = ?) + (SELECT COUNT(*) FROM offers WHERE work_type_id = ?) AS n',
      )
      .get(id, id) as { n: number };
    return row.n;
  }

  /** Usuwa tylko nieużywany rodzaj pracy; używany można ukryć. */
  remove(id: number): void {
    this.require(id);
    const used = this.usage(id);
    if (used > 0) {
      throw new Error(`Ten rodzaj pracy jest używany w ${used} zleceniu lub ofercie – możesz go tylko ukryć`);
    }
    this.db.connection.prepare('DELETE FROM work_types WHERE id = ?').run(id);
  }

  /** Wgrywa domyślne szablony tylko do pustej bazy (żeby zmieniona nazwa nie „wracała” po restarcie). */
  seedDefaults(defaults: readonly WorkTypeDefinition[]): void {
    if (this.findAll().length > 0) return;
    for (const def of defaults) this.create(def);
  }

  findById(id: number): WorkType | null {
    const row = this.db.connection.prepare('SELECT id, name, hidden FROM work_types WHERE id = ?').get(id) as
      WorkTypeRow | undefined;
    return row ? this.toWorkType(row) : null;
  }

  findAll(): WorkType[] {
    const rows = this.db.connection
      .prepare('SELECT id, name, hidden FROM work_types ORDER BY id')
      .all() as WorkTypeRow[];
    return rows.map((r) => this.toWorkType(r));
  }

  /** Rodzaje prac do wyboru przy nowym zleceniu lub ofercie (bez ukrytych). */
  findActive(): WorkType[] {
    return this.findAll().filter((w) => !w.hidden);
  }

  private require(id: number): WorkType {
    const found = this.findById(id);
    if (!found) throw new Error(`Nie ma rodzaju pracy o numerze ${id}`);
    return found;
  }

  private requireFreeName(name: string, ownId: number | null): void {
    const other = this.findIdByName(name);
    if (other !== null && other !== ownId) throw new Error(`Rodzaj pracy „${name.trim()}” już istnieje`);
  }

  private insertSteps(id: number, def: WorkTypeDefinition): void {
    const insertStep = this.db.connection.prepare(
      'INSERT INTO step_templates (work_type_id, position, name, kind, limit_days, provisional, payment) VALUES (?, ?, ?, ?, ?, ?, ?)',
    );
    def.steps.forEach((s, i) =>
      insertStep.run(id, i + 1, s.name.trim(), s.kind, s.limitDays, s.provisional ? 1 : 0, s.payment ? 1 : 0),
    );
  }

  private toWorkType(row: WorkTypeRow): WorkType {
    return { id: row.id, name: row.name, hidden: row.hidden === 1, steps: this.stepsOf(row.id) };
  }

  /** Nazwy porównujemy bez wielkości liter i spacji na końcach („Mapa” = „ mapa ”). */
  private findIdByName(name: string): number | null {
    const row = this.db.connection
      .prepare('SELECT id FROM work_types WHERE lower(name) = lower(?)')
      .get(name.trim()) as { id: number } | undefined;
    return row?.id ?? null;
  }

  private stepsOf(workTypeId: number): StoredStep[] {
    const rows = this.db.connection
      .prepare(
        'SELECT position, name, kind, limit_days, provisional, payment FROM step_templates WHERE work_type_id = ? ORDER BY position',
      )
      .all(workTypeId) as StepRow[];
    return rows.map((r) => ({
      position: r.position,
      name: r.name,
      kind: r.kind,
      limitDays: r.limit_days,
      provisional: r.provisional === 1,
      payment: r.payment === 1,
    }));
  }
}
