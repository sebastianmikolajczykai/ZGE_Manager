import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
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
let runCount = 0;

/** Uruchamia plik .bat; zwraca kod wyjścia i to, co plik wypisał (do diagnozy w CI). */
function runScript(name: string, env: NodeJS.ProcessEnv): { status: number | null; output: string } {
  // Osobny plik na każde uruchomienie: serwer startowany w tle dziedziczy uchwyt pliku z pierwszego uruchomienia.
  runCount += 1;
  const logFile = path.join(env.ZGE_TEST_DIR as string, `${runCount}-${name}.log`);
  // Wyjście do pliku, a nie do potoku: uruchomiony w tle serwer nie trzyma potoków, więc test nie czeka na jego koniec.
  const result = spawnSync('cmd.exe', ['/d', '/s', '/c', `""${name}" > "${logFile}" 2>&1"`], {
    cwd: REPO,
    env,
    stdio: 'ignore',
    windowsVerbatimArguments: true,
  });
  const output = existsSync(logFile) ? readFileSync(logFile, 'utf8') : '(brak wyjścia)';
  return { status: result.status, output };
}

function expectSuccess(name: string, env: NodeJS.ProcessEnv): void {
  const { status, output } = runScript(name, env);
  expect(status, `${name} wypisał:\n${output}`).toBe(0);
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
      ZGE_TEST_DIR: dir,
    };
  });

  afterAll(() => {
    runScript('Zatrzymaj ZGE.bat', env);
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
  });

  it(
    '"Uruchom ZGE" starts the app, which makes today\'s backup; "Zatrzymaj ZGE" stops it',
    async () => {
      expectSuccess('Uruchom ZGE.bat', env);
      expect(await isRunning()).toBe(true);
      expect(readdirSync(env.BACKUP_DIR as string)).toEqual([
        expect.stringMatching(/^zge-\d{4}-\d{2}-\d{2}\.db$/),
      ]);

      expectSuccess('Uruchom ZGE.bat', env); // druga próba: aplikacja już działa
      expectSuccess('Zatrzymaj ZGE.bat', env);
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
      'ZGE Menedzer.lnk',
    );

    expectSuccess('Włącz autostart.bat', env);
    expect(existsSync(shortcut)).toBe(true);

    expectSuccess('Wyłącz autostart.bat', env);
    expect(existsSync(shortcut)).toBe(false);
  }, 60_000);
});
