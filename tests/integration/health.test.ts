import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../../src/app.js';
import { createPool, migrate } from '../../src/db.js';
import type { Pool } from 'pg';
import type { FastifyInstance } from 'fastify';

const url = process.env.TEST_DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/zge_test';

describe('GET /health', () => {
  let pool: Pool;
  let app: FastifyInstance;

  beforeAll(async () => {
    pool = createPool(url);
    await migrate(pool);
    app = buildApp({ pool });
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  it('reports ok when the database answers', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok', db: 'ok' });
  });

  it('migrations are idempotent', async () => {
    await migrate(pool);
    const { rows } = await pool.query('SELECT count(*)::int AS n FROM schema_migrations');
    expect(rows[0].n).toBeGreaterThanOrEqual(1);
  });
});
