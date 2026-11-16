import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildApp } from '../../src/app.js';
import { openDb, migrate, type Db } from '../../src/db.js';
import type { FastifyInstance } from 'fastify';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

describe('database + /health', () => {
  let dir: string;
  let db: Db;
  let app: FastifyInstance;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'zge-'));
    db = openDb(path.join(dir, 'sub', 'zge.db'));
    migrate(db);
    app = buildApp({ db });
  });

  afterEach(async () => {
    await app.close();
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('creates the data file (and its folder) on disk', () => {
    expect(existsSync(path.join(dir, 'sub', 'zge.db'))).toBe(true);
  });

  it('uses WAL journal and enforces foreign keys', () => {
    expect(db.pragma('journal_mode', { simple: true })).toBe('wal');
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
  });

  it('reports ok when the database answers', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok', db: 'ok' });
  });

  it('reports 503 when the database is gone', async () => {
    db.close();
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(503);
    db = openDb(path.join(dir, 'sub', 'zge.db'));
  });

  it('migrations are idempotent', () => {
    migrate(db);
    const row = db.prepare('SELECT count(*) AS n FROM schema_migrations').get() as { n: number };
    expect(row.n).toBeGreaterThanOrEqual(1);
  });
});
