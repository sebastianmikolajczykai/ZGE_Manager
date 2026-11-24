import { describe, it, expect, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { AppDatabase } from '../../../src/db.js';
import { DatabaseBackup } from '../../../src/backup/database-backup.js';
import { backupsToDelete } from '../../../src/backup/backup-plan.js';

/** Przed aktualizacją schematu bazy robimy osobną kopię (żeby dało się wrócić, gdyby coś poszło źle). */
describe('kopia bazy przed aktualizacją (migracją)', () => {
  let dir: string;
  let db: AppDatabase;

  afterEach(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  const open = () => {
    dir = mkdtempSync(path.join(tmpdir(), 'zge-migr-'));
    db = AppDatabase.open(path.join(dir, 'dane', 'zge.db'));
  };

  it('knows which updates are waiting; none after migrating', () => {
    open();
    expect(db.pendingMigrations().length).toBeGreaterThan(0);
    expect(db.hasData()).toBe(false);
    db.migrate();
    expect(db.pendingMigrations()).toEqual([]);
    expect(db.hasData()).toBe(true);
  });

  it('copies the database as it was before the update, with a name the daily cleanup never deletes', () => {
    open();
    db.migrate();
    db.connection.exec("CREATE TABLE probka (tekst TEXT); INSERT INTO probka VALUES ('zlecenie Kowalski')");
    const backupDir = path.join(dir, 'kopie');

    const file = new DatabaseBackup(db, backupDir, 30).copyBeforeUpdate('2026-11-24');

    expect(path.basename(file)).toBe('zge-przed-aktualizacja-2026-11-24.db');
    const copy = new Database(file, { readonly: true });
    expect(copy.prepare('SELECT tekst FROM probka').pluck().get()).toBe('zlecenie Kowalski');
    copy.close();
    expect(backupsToDelete(readdirSync(backupDir), 1)).toEqual([]);
  });

  it('a second update on the same day keeps the first copy and adds a numbered one', () => {
    open();
    db.migrate();
    const backup = new DatabaseBackup(db, path.join(dir, 'kopie'), 30);
    const first = backup.copyBeforeUpdate('2026-11-24');
    const second = backup.copyBeforeUpdate('2026-11-24');
    expect(path.basename(second)).toBe('zge-przed-aktualizacja-2026-11-24-2.db');
    expect(existsSync(first)).toBe(true);
  });
});
