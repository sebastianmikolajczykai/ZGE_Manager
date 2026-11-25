import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { AppDatabase } from '../../../src/db.js';
import { OrderService } from '../../../src/modules/orders/order-service.js';
import { WorkTypeRepository } from '../../../src/modules/work-types/work-type-repository.js';

const MIGRATIONS = path.join(import.meta.dirname, '..', '..', '..', 'migrations');
const PARALLEL_MIGRATION = '016_parallel_steps.sql';

/** Baza „sprzed aktualizacji”: wszystkie migracje przed krokami równoległymi. */
function databaseBefore(file: string): AppDatabase {
  const db = AppDatabase.open(file);
  db.connection.exec('CREATE TABLE schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT)');
  for (const name of readdirSync(MIGRATIONS).sort()) {
    if (name >= PARALLEL_MIGRATION) break;
    db.connection.exec(readFileSync(path.join(MIGRATIONS, name), 'utf8'));
    db.connection.prepare('INSERT INTO schema_migrations (name) VALUES (?)').run(name);
  }
  return db;
}

describe('migracja 016: kroki równoległe', () => {
  let dir: string;
  let db: AppDatabase;

  afterEach(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('keeps an order in progress exactly as it was (one step after another) and marks the Podział template', () => {
    dir = mkdtempSync(path.join(tmpdir(), 'zge-'));
    db = databaseBefore(path.join(dir, 'zge.db'));
    db.connection.exec(`INSERT INTO work_types (id, name) VALUES (1, 'Podział nieruchomości'), (2, 'Inny');
      INSERT INTO step_templates (work_type_id, position, name, kind, limit_days) VALUES
        (1, 1, 'Ustalenie terminu pomiaru w terenie', 'own', 2),
        (1, 2, 'Analiza materiałów w urzędzie', 'own', 2),
        (1, 3, 'Wysłanie zawiadomień', 'own', 2),
        (2, 1, 'Coś innego', 'own', 2),
        (2, 2, 'Analiza materiałów w urzędzie', 'own', 2);
      INSERT INTO orders (id, client_name, phone, town, work_type_id, received_on, lead_person) VALUES (1, 'Klient', '1', 'X', 1, '2026-11-02', 'Łukasz');
      INSERT INTO order_steps (order_id, position, name, kind, limit_days, status, started_on, done_on, done_by) VALUES
        (1, 1, 'Ustalenie terminu pomiaru w terenie', 'own', 2, 'done', '2026-11-02', '2026-11-03', 'Łukasz'),
        (1, 2, 'Analiza materiałów w urzędzie', 'own', 2, 'active', '2026-11-03', NULL, NULL),
        (1, 3, 'Wysłanie zawiadomień', 'own', 2, 'pending', NULL, NULL, NULL);
      INSERT INTO order_history (order_id, happened_on, person, action) VALUES (1, '2026-11-02', 'Łukasz', 'created');
      INSERT INTO order_history (order_id, happened_on, person, action, step_position, step_name) VALUES (1, '2026-11-03', 'Łukasz', 'step_done', 1, 'Ustalenie terminu pomiaru w terenie');`);

    db.migrate();

    const orders = new OrderService(db, () => '2026-11-24');
    const order = orders.get(1);
    expect(order?.steps.map((s) => [s.status, s.startedOn, s.doneBy, s.parallel])).toEqual([
      ['done', '2026-11-02', 'Łukasz', false],
      ['active', '2026-11-03', null, false],
      ['pending', null, null, false],
    ]);
    expect(orders.history(1)).toHaveLength(2);
    orders.completeStep(1, 2, 'Bartek');
    expect(orders.get(1)?.steps.map((s) => s.status)).toEqual(['done', 'done', 'active']);

    const repo = new WorkTypeRepository(db);
    expect(repo.findById(1)?.steps.map((s) => s.parallel)).toEqual([false, true, false]);
    expect(repo.findById(2)?.steps.map((s) => s.parallel)).toEqual([false, false]);
  });
});
