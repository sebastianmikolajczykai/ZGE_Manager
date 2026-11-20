import type { AppDatabase } from '../../db.js';
import type { LocalDate } from '../urgency/day-counter.js';
import { requirePerson } from '../common/form-fields.js';
import type { WorkTypeRepository } from './work-type-repository.js';
import type { WorkTypeDefinition } from './work-type-definition.js';

export type WorkTypeAction = 'created' | 'changed' | 'copied' | 'hidden' | 'shown' | 'deleted';

export interface WorkTypeHistoryEntry {
  happenedOn: LocalDate;
  person: string;
  workTypeName: string;
  action: WorkTypeAction;
}

/** Zmiany rodzajów prac z ekranu Ustawień: każda z wybraną osobą i wpisem w historii. */
export class WorkTypeAdmin {
  constructor(
    private readonly repo: WorkTypeRepository,
    private readonly db: AppDatabase,
    private readonly today: () => LocalDate,
  ) {}

  /** id = null → nowy rodzaj pracy. Zwraca id. */
  save(id: number | null, def: WorkTypeDefinition, person: string): number {
    const who = requirePerson(person);
    const savedId = id === null ? this.repo.create(def) : (this.repo.update(id, def), id);
    this.log(who, def.name.trim(), id === null ? 'created' : 'changed');
    return savedId;
  }

  copy(id: number, person: string): number {
    const who = requirePerson(person);
    const copyId = this.repo.copy(id);
    this.log(who, this.nameOf(copyId), 'copied');
    return copyId;
  }

  setHidden(id: number, hidden: boolean, person: string): void {
    const who = requirePerson(person);
    this.repo.setHidden(id, hidden);
    this.log(who, this.nameOf(id), hidden ? 'hidden' : 'shown');
  }

  remove(id: number, person: string): void {
    const who = requirePerson(person);
    const name = this.nameOf(id);
    this.repo.remove(id);
    this.log(who, name, 'deleted');
  }

  /** Najnowsze na górze. */
  history(): WorkTypeHistoryEntry[] {
    const rows = this.db.connection
      .prepare('SELECT happened_on, person, work_type_name, action FROM work_type_history ORDER BY id DESC')
      .all() as { happened_on: string; person: string; work_type_name: string; action: WorkTypeAction }[];
    return rows.map((r) => ({
      happenedOn: r.happened_on,
      person: r.person,
      workTypeName: r.work_type_name,
      action: r.action,
    }));
  }

  private nameOf(id: number): string {
    const found = this.repo.findById(id);
    if (!found) throw new Error(`Nie ma rodzaju pracy o numerze ${id}`);
    return found.name;
  }

  private log(person: string, workTypeName: string, action: WorkTypeAction): void {
    this.db.connection
      .prepare(
        'INSERT INTO work_type_history (happened_on, person, work_type_name, action) VALUES (?, ?, ?, ?)',
      )
      .run(this.today(), person, workTypeName, action);
  }
}
