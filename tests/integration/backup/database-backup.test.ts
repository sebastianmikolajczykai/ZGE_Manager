import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { AppDatabase } from '../../../src/db.js';
import { DatabaseBackup } from '../../../src/backup/database-backup.js';

describe('DatabaseBackup', () => {
  let dir: string;
  let backupDir: string;
  let db: AppDatabase;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'zge-backup-'));
    backupDir = path.join(dir, 'OneDrive', 'ZGE kopie');
    db = AppDatabase.open(path.join(dir, 'dane', 'zge.db'));
    db.migrate();
    db.connection.exec("CREATE TABLE probka (tekst TEXT); INSERT INTO probka VALUES ('zlecenie Kowalski')");
  });

  afterEach(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('writes a full, readable copy of the database to the backup folder (creating it)', async () => {
    const result = await new DatabaseBackup(db, backupDir, 30).runIfDue('2026-11-24');

    expect(result).toBe('created');
    const copy = new Database(path.join(backupDir, 'zge-2026-11-24.db'), { readonly: true });
    expect(copy.prepare('SELECT tekst FROM probka').pluck().get()).toBe('zlecenie Kowalski');
    copy.close();
  });

  it('makes only one copy per day', async () => {
    const backup = new DatabaseBackup(db, backupDir, 30);
    await backup.runIfDue('2026-11-24');

    expect(await backup.runIfDue('2026-11-24')).toBe('already-done');
    expect(readdirSync(backupDir)).toEqual(['zge-2026-11-24.db']);
  });

  it('removes the oldest copies above the limit and leaves other files alone', async () => {
    mkdirSync(backupDir, { recursive: true });
    for (const day of ['2026-11-20', '2026-11-21', '2026-11-22'])
      writeFileSync(path.join(backupDir, `zge-${day}.db`), '');
    writeFileSync(path.join(backupDir, 'notatki.txt'), 'moje');

    await new DatabaseBackup(db, backupDir, 2).runIfDue('2026-11-24');

    expect(readdirSync(backupDir).sort()).toEqual(['notatki.txt', 'zge-2026-11-22.db', 'zge-2026-11-24.db']);
  });

  it('rejects a limit below one copy', () => {
    expect(() => new DatabaseBackup(db, backupDir, 0)).toThrow(/kopii/);
  });
});
