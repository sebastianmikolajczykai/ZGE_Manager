import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { AppDatabase } from '../../../src/db.js';
import { OfferService } from '../../../src/modules/offers/offer-service.js';
import { OrderService } from '../../../src/modules/orders/order-service.js';
import { UrgencyRules, DEFAULT_URGENCY_SETTINGS } from '../../../src/modules/urgency/urgency-rules.js';

const MIGRATIONS = path.join(import.meta.dirname, '..', '..', '..', 'migrations');
const UNDO_MIGRATION = '011_undo_history.sql';

/** Baza „sprzed aktualizacji”: wszystkie migracje przed cofaniem z historii. */
function databaseBeforeUndo(file: string): AppDatabase {
  const db = AppDatabase.open(file);
  db.connection.exec('CREATE TABLE schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT)');
  for (const name of readdirSync(MIGRATIONS).sort()) {
    if (name >= UNDO_MIGRATION) break;
    db.connection.exec(readFileSync(path.join(MIGRATIONS, name), 'utf8'));
    db.connection.prepare('INSERT INTO schema_migrations (name) VALUES (?)').run(name);
  }
  return db;
}

describe('migracja 011: cofanie z historii', () => {
  let dir: string;
  let db: AppDatabase;

  afterEach(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('keeps existing history of orders and offers; old entries without saved state are not undone', () => {
    dir = mkdtempSync(path.join(tmpdir(), 'zge-'));
    db = databaseBeforeUndo(path.join(dir, 'zge.db'));
    const c = db.connection;
    c.exec(`INSERT INTO work_types (id, name) VALUES (1, 'Test');
      INSERT INTO orders (id, client_name, phone, town, work_type_id, received_on) VALUES (1, 'Klient', '1', 'X', 1, '2026-11-02');
      INSERT INTO order_steps (order_id, position, name, kind, status, started_on) VALUES (1, 1, 'Codzienny', 'daily', 'active', '2026-11-02');
      INSERT INTO order_history (order_id, happened_on, person, action) VALUES (1, '2026-11-02', 'A', 'created');
      INSERT INTO order_history (order_id, happened_on, person, action, step_position, step_name) VALUES (1, '2026-11-03', 'A', 'checked', 1, 'Codzienny');
      INSERT INTO offers (id, client_name, phone, work_type_id, sent_on, sent_by, last_contact_on) VALUES (1, 'Klient', '1', 1, '2026-11-02', 'A', '2026-11-03');
      INSERT INTO offer_history (offer_id, happened_on, person, action, note) VALUES (1, '2026-11-02', 'A', 'created', NULL);
      INSERT INTO offer_history (offer_id, happened_on, person, action, note) VALUES (1, '2026-11-03', 'B', 'called', 'oddzwoni');`);

    db.migrate();

    const today = () => '2026-11-21';
    const orders = new OrderService(db, today);
    const offers = new OfferService(db, today, new UrgencyRules(DEFAULT_URGENCY_SETTINGS));
    expect(orders.history(1).map((h) => [h.action, h.reverted])).toEqual([
      ['created', false],
      ['checked', false],
    ]);
    expect(offers.history(1)).toMatchObject([
      { action: 'created', person: 'A' },
      { action: 'called', person: 'B', note: 'oddzwoni', reverted: false },
    ]);
    expect(orders.undoableEntryId(1)).toBeNull();
    expect(offers.undoableEntryId(1)).toBeNull();
  });
});
