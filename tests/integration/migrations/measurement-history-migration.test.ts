import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { AppDatabase } from '../../../src/db.js';
import { OrderService } from '../../../src/modules/orders/order-service.js';

const MIGRATIONS = path.join(import.meta.dirname, '..', '..', '..', 'migrations');
const MEASUREMENT_MIGRATION = '012_measurement_history.sql';

/** Baza „sprzed aktualizacji”: wszystkie migracje przed wpisem „data pomiaru” w historii. */
function databaseBefore(file: string): AppDatabase {
  const db = AppDatabase.open(file);
  db.connection.exec('CREATE TABLE schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT)');
  for (const name of readdirSync(MIGRATIONS).sort()) {
    if (name >= MEASUREMENT_MIGRATION) break;
    db.connection.exec(readFileSync(path.join(MIGRATIONS, name), 'utf8'));
    db.connection.prepare('INSERT INTO schema_migrations (name) VALUES (?)').run(name);
  }
  return db;
}

describe('migracja 012: data pomiaru w historii zlecenia', () => {
  let dir: string;
  let db: AppDatabase;

  afterEach(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('keeps the whole existing history (with undo state) and allows the new entry', () => {
    dir = mkdtempSync(path.join(tmpdir(), 'zge-'));
    db = databaseBefore(path.join(dir, 'zge.db'));
    db.connection.exec(`INSERT INTO work_types (id, name) VALUES (1, 'Test');
      INSERT INTO orders (id, client_name, phone, town, work_type_id, received_on) VALUES (1, 'Klient', '1', 'X', 1, '2026-11-02');
      INSERT INTO order_steps (order_id, position, name, kind, status, started_on) VALUES (1, 1, 'Pomiar', 'scheduled', 'active', '2026-11-02');
      INSERT INTO order_history (order_id, happened_on, person, action) VALUES (1, '2026-11-02', 'A', 'created');
      INSERT INTO order_history (order_id, happened_on, person, action, step_position, step_name, note, undo_data, reverted)
        VALUES (1, '2026-11-03', 'B', 'limit_changed', 1, 'Pomiar', '2 → 6 dni', '{"limitDays":2}', 1);`);

    db.migrate();

    const orders = new OrderService(db, () => '2026-11-21');
    expect(orders.history(1)).toMatchObject([
      { person: 'A', action: 'created', reverted: false },
      { person: 'B', action: 'limit_changed', note: '2 → 6 dni', reverted: true },
    ]);
    orders.setMeasurementDate(1, '2026-11-25', 'C');
    expect(orders.history(1).at(-1)).toMatchObject({ action: 'measurement_set', note: 'brak → 25.11.2026' });
  });
});
