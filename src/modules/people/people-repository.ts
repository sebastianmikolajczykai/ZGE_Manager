import type { AppDatabase } from '../../db.js';

export interface Person {
  id: number;
  name: string;
}

/** Osoby, które mogą odhaczać kroki (Ustawienia → Osoby). */
export class PeopleRepository {
  constructor(private readonly db: AppDatabase) {}

  list(): Person[] {
    return this.db.connection
      .prepare('SELECT id, name FROM people WHERE active = 1 ORDER BY id')
      .all() as Person[];
  }

  add(rawName: string): number {
    const name = rawName.trim();
    if (!name) throw new Error('Podaj imię osoby');
    if (this.list().some((p) => p.name.toLowerCase() === name.toLowerCase())) {
      throw new Error(`„${name}” już jest na liście`);
    }
    return Number(
      this.db.connection.prepare('INSERT INTO people (name) VALUES (?)').run(name).lastInsertRowid,
    );
  }

  /** Ukrywa osobę z przycisków; jej imię zostaje w historii zleceń. */
  remove(id: number): void {
    this.db.connection.prepare('UPDATE people SET active = 0 WHERE id = ?').run(id);
  }

  seedIfEmpty(names: readonly string[]): void {
    if (this.list().length === 0) names.forEach((n) => this.add(n));
  }
}
