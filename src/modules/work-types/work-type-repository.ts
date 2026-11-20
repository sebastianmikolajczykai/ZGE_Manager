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
  steps: StoredStep[];
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
    if (this.findIdByName(def.name) !== null) {
      throw new Error(`Rodzaj pracy „${def.name}” już istnieje`);
    }
    const conn = this.db.connection;
    return conn.transaction(() => {
      const id = Number(
        conn.prepare('INSERT INTO work_types (name) VALUES (?)').run(def.name.trim()).lastInsertRowid,
      );
      const insertStep = conn.prepare(
        'INSERT INTO step_templates (work_type_id, position, name, kind, limit_days, provisional, payment) VALUES (?, ?, ?, ?, ?, ?, ?)',
      );
      def.steps.forEach((s, i) =>
        insertStep.run(
          id,
          i + 1,
          s.name.trim(),
          s.kind,
          s.limitDays,
          s.provisional ? 1 : 0,
          s.payment ? 1 : 0,
        ),
      );
      return id;
    })();
  }

  /** Wgrywa domyślne szablony, pomijając te, które już są (bezpieczne przy każdym starcie). */
  seedDefaults(defaults: readonly WorkTypeDefinition[]): void {
    for (const def of defaults) if (this.findIdByName(def.name) === null) this.create(def);
  }

  findById(id: number): WorkType | null {
    const row = this.db.connection.prepare('SELECT id, name FROM work_types WHERE id = ?').get(id) as
      { id: number; name: string } | undefined;
    return row ? { ...row, steps: this.stepsOf(row.id) } : null;
  }

  findAll(): WorkType[] {
    const rows = this.db.connection.prepare('SELECT id, name FROM work_types ORDER BY id').all() as {
      id: number;
      name: string;
    }[];
    return rows.map((r) => ({ ...r, steps: this.stepsOf(r.id) }));
  }

  private findIdByName(name: string): number | null {
    const row = this.db.connection.prepare('SELECT id FROM work_types WHERE name = ?').get(name.trim()) as
      { id: number } | undefined;
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
