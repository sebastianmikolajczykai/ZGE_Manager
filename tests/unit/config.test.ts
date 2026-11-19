import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { loadConfig } from '../../src/config.js';

describe('loadConfig', () => {
  it('reads DB_PATH, PORT and HOST from env', () => {
    const cfg = loadConfig({ DB_PATH: '/data/zge.db', PORT: '4000', HOST: '127.0.0.1' });
    expect(cfg).toEqual({
      dbPath: path.resolve('/data/zge.db'),
      port: 4000,
      host: '127.0.0.1',
      demo: false,
    });
  });

  it('defaults to a local data file, port 3000 and localhost only', () => {
    const cfg = loadConfig({});
    expect(cfg.dbPath).toBe(path.resolve('dane/zge.db'));
    expect(cfg.port).toBe(3000);
    expect(cfg.host).toBe('127.0.0.1');
  });

  it('turns on example data only when ZGE_DEMO=1 (never by default)', () => {
    expect(loadConfig({ ZGE_DEMO: '1' }).demo).toBe(true);
    expect(loadConfig({ ZGE_DEMO: '0' }).demo).toBe(false);
    expect(loadConfig({}).demo).toBe(false);
  });

  it('rejects a non-numeric PORT', () => {
    expect(() => loadConfig({ PORT: 'abc' })).toThrow(/PORT/);
  });
});
