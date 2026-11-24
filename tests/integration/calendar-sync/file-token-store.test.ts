import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { FileTokenStore } from '../../../src/modules/calendar-sync/google-oauth.js';

describe('FileTokenStore: token Google w pliku na komputerze (poza repozytorium)', () => {
  let dir: string;
  let file: string;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'zge-'));
    file = path.join(dir, 'pod', 'google-token.json');
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('no file → not connected', () => {
    expect(new FileTokenStore(file).read()).toBeNull();
  });

  it('writes (creating the folder) and reads back', () => {
    const store = new FileTokenStore(file);
    const token = { refreshToken: 'r', accessToken: 'a', expiresAt: '2026-11-24T11:00:00.000Z' };
    store.write(token);
    expect(new FileTokenStore(file).read()).toEqual(token);
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual(token);
  });

  it('clear removes the file; clearing twice is fine', () => {
    const store = new FileTokenStore(file);
    store.write({ refreshToken: 'r', accessToken: 'a', expiresAt: 'x' });
    store.clear();
    store.clear();
    expect(existsSync(file)).toBe(false);
  });

  it('a damaged file is treated as not connected, not a crash', () => {
    const store = new FileTokenStore(file);
    store.write({ refreshToken: 'r', accessToken: 'a', expiresAt: 'x' });
    writeFileSync(file, '{zepsute');
    expect(store.read()).toBeNull();
  });
});
