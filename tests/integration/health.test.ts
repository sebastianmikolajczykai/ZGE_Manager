import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildApp } from '../../src/app.js';
import { AppDatabase } from '../../src/db.js';
import type { FastifyInstance } from 'fastify';
import { mkdtempSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

describe('AppDatabase + /health', () => {
  let dir: string;
  let dbFile: string;
  let db: AppDatabase;
  let app: FastifyInstance;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'zge-'));
    dbFile = path.join(dir, 'sub', 'zge.db');
    db = AppDatabase.open(dbFile);
    db.migrate();
    app = buildApp({ db });
  });

  afterEach(async () => {
    await app.close();
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('creates the data file (and its folder) on disk', () => {
    expect(existsSync(dbFile)).toBe(true);
  });

  it('uses WAL journal and enforces foreign keys', () => {
    expect(db.connection.pragma('journal_mode', { simple: true })).toBe('wal');
    expect(db.connection.pragma('foreign_keys', { simple: true })).toBe(1);
  });

  it('reports ok when the database answers', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok', db: 'ok' });
  });

  it('reports 503 when the database is closed', async () => {
    db.close();
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(503);
    db = AppDatabase.open(dbFile);
  });

  it('applies each migration only once', () => {
    const count = () =>
      (db.connection.prepare('SELECT count(*) AS n FROM schema_migrations').get() as { n: number }).n;
    const files = readdirSync(fileURLToPath(new URL('../../migrations', import.meta.url))).filter((f) =>
      f.endsWith('.sql'),
    );
    expect(count()).toBe(files.length);
    db.migrate();
    expect(count()).toBe(files.length);
  });

  it('keeps data between restarts (data lives in the file)', () => {
    db.connection.exec('CREATE TABLE t (x INTEGER)');
    db.connection.prepare('INSERT INTO t VALUES (42)').run();
    db.close();
    db = AppDatabase.open(dbFile);
    expect(db.connection.prepare('SELECT x FROM t').get()).toEqual({ x: 42 });
  });
});

describe('start page', () => {
  it('serves Polish HTML titled ZGE Menedżer', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'zge-'));
    const db = AppDatabase.open(path.join(dir, 'zge.db'));
    db.migrate();
    const app = buildApp({ db });
    const res = await app.inject({ method: 'GET', url: '/' });
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.body).toContain('<html lang="pl">');
    expect(res.body).toContain('<title>ZGE Menedżer</title>');
    expect(res.body).toContain('Brak aktywnych zleceń');
    await app.close();
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });
});
