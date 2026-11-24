import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { AppDatabase } from '../../../src/db.js';
import { OrderService } from '../../../src/modules/orders/order-service.js';

const MIGRATIONS = path.join(import.meta.dirname, '..', '..', '..', 'migrations');
const ORDER_NUMBER_MIGRATION = '015_order_number.sql';

/** Baza „sprzed aktualizacji”: wszystkie migracje przed numerem zlecenia. */
function databaseBefore(file: string): AppDatabase {
  const db = AppDatabase.open(file);
  db.connection.exec('CREATE TABLE schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT)');
  for (const name of readdirSync(MIGRATIONS).sort()) {
    if (name >= ORDER_NUMBER_MIGRATION) break;
    db.connection.exec(readFileSync(path.join(MIGRATIONS, name), 'utf8'));
    db.connection.prepare('INSERT INTO schema_migrations (name) VALUES (?)').run(name);
  }
  return db;
}

describe('migracja 015: numer zlecenia', () => {
  let dir: string;
  let db: AppDatabase;

  afterEach(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('keeps existing orders (without a number) and their whole history, then allows the new entry', () => {
    dir = mkdtempSync(path.join(tmpdir(), 'zge-'));
    db = databaseBefore(path.join(dir, 'zge.db'));
    db.connection.exec(`INSERT INTO work_types (id, name) VALUES (1, 'Test');
      INSERT INTO orders (id, client_name, phone, town, work_type_id, received_on) VALUES (1, 'Klient', '1', 'X', 1, '2026-11-02');
      INSERT INTO order_steps (order_id, position, name, kind, status, started_on) VALUES (1, 1, 'Krok', 'own', 'active', '2026-11-02');
      INSERT INTO order_history (order_id, happened_on, person, action) VALUES (1, '2026-11-02', 'A', 'created');
      INSERT INTO order_history (order_id, happened_on, person, action, note, undo_data, reverted)
        VALUES (1, '2026-11-03', 'B', 'measurement_set', 'brak → 25.11.2026', '{"measurementOn":null}', 1);`);

    db.migrate();

    const orders = new OrderService(db, () => '2026-11-24');
    expect(orders.get(1)?.orderNumber).toBeNull();
    expect(orders.history(1)).toMatchObject([
      { person: 'A', action: 'created', reverted: false },
      { person: 'B', action: 'measurement_set', note: 'brak → 25.11.2026', reverted: true },
    ]);
    orders.setOrderNumber(1, '100', 'C');
    expect(orders.history(1).at(-1)).toMatchObject({ action: 'number_set', note: 'brak → 100' });
  });
});
