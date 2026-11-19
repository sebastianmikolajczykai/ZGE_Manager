import Database from 'better-sqlite3';
import { mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const MIGRATIONS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'migrations');
const BUSY_TIMEOUT_MS = 5000;

/** Plik bazy danych aplikacji (SQLite) wraz z migracjami schematu. */
export class AppDatabase {
  private constructor(readonly connection: Database.Database) {}

  /** Otwiera (lub tworzy) plik bazy, zakładając brakujące foldery. */
  static open(file: string): AppDatabase {
    mkdirSync(path.dirname(file), { recursive: true });
    const connection = new Database(file);
    connection.pragma('journal_mode = WAL');
    connection.pragma('foreign_keys = ON');
    connection.pragma(`busy_timeout = ${BUSY_TIMEOUT_MS}`);
    return new AppDatabase(connection);
  }

  /** Stosuje każdy plik migrations/*.sql dokładnie raz, w kolejności nazw, każdy w osobnej transakcji. */
  migrate(): void {
    this.connection.exec(
      "CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT (datetime('now')))",
    );
    const applied = new Set(
      (this.connection.prepare('SELECT name FROM schema_migrations').all() as { name: string }[]).map(
        (r) => r.name,
      ),
    );
    const pending = readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql') && !applied.has(f))
      .sort();
    for (const name of pending) this.applyMigration(name);
  }

  /** Rzuca wyjątek, gdy baza nie odpowiada (np. jest zamknięta). */
  ping(): void {
    this.connection.prepare('SELECT 1').get();
  }

  close(): void {
    this.connection.close();
  }

  private applyMigration(name: string): void {
    const sql = readFileSync(path.join(MIGRATIONS_DIR, name), 'utf8');
    this.connection.transaction(() => {
      this.connection.exec(sql);
      this.connection.prepare('INSERT INTO schema_migrations (name) VALUES (?)').run(name);
    })();
  }
}
