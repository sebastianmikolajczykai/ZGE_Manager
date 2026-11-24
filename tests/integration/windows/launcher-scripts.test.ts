import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Pliki do klikania dla klienta (Windows). Na Linuksie test jest pomijany;
 * w CI uruchamia się na windows-latest.
 */
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const TEST_PORT = '3987';
const STARTUP_TIMEOUT_MS = 180_000;

function runScript(name: string, env: NodeJS.ProcessEnv): number | null {
  // stdio 'ignore': uruchomiony w tle serwer nie trzyma potoków, więc test nie czeka na jego koniec.
  const result = spawnSync('cmd.exe', ['/d', '/s', '/c', `"${name}"`], {
    cwd: REPO,
    env,
    stdio: 'ignore',
    windowsVerbatimArguments: true,
  });
  return result.status;
}

async function isRunning(): Promise<boolean> {
  try {
    return (await fetch(`http://127.0.0.1:${TEST_PORT}/health`)).ok;
  } catch {
    return false;
  }
}

describe.runIf(process.platform === 'win32')('pliki Windows: uruchomienie, kopia, autostart', () => {
  let dir: string;
  let env: NodeJS.ProcessEnv;

  beforeAll(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'zge-win-'));
    env = {
      ...process.env,
      PORT: TEST_PORT,
      DB_PATH: path.join(dir, 'dane', 'zge.db'),
      BACKUP_DIR: path.join(dir, 'OneDrive', 'ZGE kopie'),
      APPDATA: path.join(dir, 'AppData'),
      ZGE_BEZ_PRZEGLADARKI: '1',
      ZGE_BEZ_PAUZY: '1',
    };
  });

  afterAll(() => {
    runScript('Zatrzymaj ZGE.bat', env);
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
  });

  it(
    '"Uruchom ZGE" starts the app, which makes today\'s backup; "Zatrzymaj ZGE" stops it',
    async () => {
      expect(runScript('Uruchom ZGE.bat', env)).toBe(0);
      expect(await isRunning()).toBe(true);
      expect(readdirSync(env.BACKUP_DIR as string)).toEqual([
        expect.stringMatching(/^zge-\d{4}-\d{2}-\d{2}\.db$/),
      ]);

      expect(runScript('Uruchom ZGE.bat', env)).toBe(0); // druga próba: aplikacja już działa
      expect(runScript('Zatrzymaj ZGE.bat', env)).toBe(0);
      expect(await isRunning()).toBe(false);
    },
    STARTUP_TIMEOUT_MS,
  );

  it('"Włącz autostart" adds a shortcut to Windows startup and "Wyłącz autostart" removes it', () => {
    const shortcut = path.join(
      env.APPDATA as string,
      'Microsoft',
      'Windows',
      'Start Menu',
      'Programs',
      'Startup',
      'ZGE Menedżer.lnk',
    );

    expect(runScript('Włącz autostart.bat', env)).toBe(0);
    expect(existsSync(shortcut)).toBe(true);

    expect(runScript('Wyłącz autostart.bat', env)).toBe(0);
    expect(existsSync(shortcut)).toBe(false);
  }, 60_000);
});
