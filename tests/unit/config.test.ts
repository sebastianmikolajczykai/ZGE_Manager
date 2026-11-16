import { describe, it, expect } from 'vitest';
import { loadConfig } from '../../src/config.js';

describe('loadConfig', () => {
  it('reads DATABASE_URL and PORT from env', () => {
    const cfg = loadConfig({ DATABASE_URL: 'postgres://x/y', PORT: '4000' });
    expect(cfg).toEqual({ databaseUrl: 'postgres://x/y', port: 4000 });
  });

  it('defaults PORT to 3000', () => {
    expect(loadConfig({ DATABASE_URL: 'postgres://x/y' }).port).toBe(3000);
  });

  it('fails fast when DATABASE_URL is missing', () => {
    expect(() => loadConfig({})).toThrow(/DATABASE_URL/);
  });

  it('rejects a non-numeric PORT', () => {
    expect(() => loadConfig({ DATABASE_URL: 'postgres://x/y', PORT: 'abc' })).toThrow(/PORT/);
  });
});
