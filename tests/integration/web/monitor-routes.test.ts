import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { AppDatabase } from '../../../src/db.js';
import { buildApp } from '../../../src/app.js';

const FORM = { 'content-type': 'application/x-www-form-urlencoded' };

describe('Widok na monitor (/monitor)', () => {
  let dir: string;
  let db: AppDatabase;
  let app: FastifyInstance;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'zge-'));
    db = AppDatabase.open(path.join(dir, 'zge.db'));
    db.migrate();
    app = buildApp({ db, today: () => '2026-11-16', defaultPeople: ['Anna', 'Piotr'] });
  });

  afterEach(async () => {
    await app.close();
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  const post = (url: string, fields: Record<string, string>) =>
    app.inject({ method: 'POST', url, headers: FORM, payload: new URLSearchParams(fields).toString() });

  it('shows the active orders as big tiles, refreshing on the interval from settings', async () => {
    await post('/zlecenia', {
      clientName: 'Jan Przykładowy',
      phone: '600 100 200',
      town: 'Przykładowo',
      workTypeId: '1',
      measurementOn: '2026-11-30',
      person: 'Anna',
    });
    const res = await app.inject({ method: 'GET', url: '/monitor' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.body).toContain('Jan Przykładowy');
    expect(res.body).toContain('Ustalenie terminu pomiaru w terenie');
    expect(res.body).toContain('REFRESH_MS = 60000');
  });

  it('the side menu has a link to the monitor view (opens in a new tab)', async () => {
    const board = (await app.inject({ method: 'GET', url: '/' })).body;
    expect(board).toMatch(/href="\/monitor"[^>]*target="_blank"/);
  });
});
