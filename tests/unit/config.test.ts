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
      backupDir: path.resolve('dane/kopie'),
      backupKeep: 30,
      google: null,
      googleTokenFile: path.resolve('dane/google-token.json'),
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

  it('reads the daily backup folder and the number of copies to keep', () => {
    const cfg = loadConfig({ BACKUP_DIR: '/OneDrive/ZGE kopie', BACKUP_KEEP: '14' });
    expect(cfg.backupDir).toBe(path.resolve('/OneDrive/ZGE kopie'));
    expect(cfg.backupKeep).toBe(14);
  });

  it('rejects a number of backup copies that is not a positive whole number', () => {
    expect(() => loadConfig({ BACKUP_KEEP: '0' })).toThrow(/BACKUP_KEEP/);
    expect(() => loadConfig({ BACKUP_KEEP: 'dużo' })).toThrow(/BACKUP_KEEP/);
  });

  it('rejects a non-numeric PORT', () => {
    expect(() => loadConfig({ PORT: 'abc' })).toThrow(/PORT/);
  });

  it('Google keys come only from env (both needed), token file in dane/ by default', () => {
    expect(loadConfig({ GOOGLE_CLIENT_ID: 'id' }).google).toBeNull();
    expect(loadConfig({ GOOGLE_CLIENT_ID: 'id', GOOGLE_CLIENT_SECRET: 's' }).google).toEqual({
      clientId: 'id',
      clientSecret: 's',
    });
    expect(loadConfig({ GOOGLE_CLIENT_ID: ' ', GOOGLE_CLIENT_SECRET: 's' }).google).toBeNull();
    expect(loadConfig({ GOOGLE_TOKEN_FILE: '/x/t.json' }).googleTokenFile).toBe(path.resolve('/x/t.json'));
  });
});
