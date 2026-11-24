import { existsSync } from 'node:fs';
import { loadConfig } from './config.js';
import { AppDatabase } from './db.js';
import { buildApp } from './app.js';
import { warsawDate } from './clock.js';
import { seedDemo } from './demo/demo-seed.js';
import { DatabaseBackup } from './backup/database-backup.js';
import { BackupScheduler } from './backup/backup-scheduler.js';
import { GoogleOAuth, FileTokenStore } from './modules/calendar-sync/google-oauth.js';
import { GoogleCalendarApi } from './modules/calendar-sync/google-calendar-api.js';
import type { Config } from './config.js';

// Ustawienia z pliku .env (np. BACKUP_DIR); zmienne ustawione w systemie mają pierwszeństwo.
const ENV_FILE = '.env';
if (existsSync(ENV_FILE)) process.loadEnvFile(ENV_FILE);

const cfg = loadConfig(process.env);
const db = AppDatabase.open(cfg.dbPath);
db.migrate();
const app = buildApp({
  db,
  calendar: googleCalendar(cfg),
  appUrl: `http://localhost:${cfg.port}`,
  calendarAutoSync: !cfg.demo,
});
if (cfg.demo) seedDemo(db, warsawDate()); // tylko demo: zmyślone zlecenia w pustej bazie
await app.listen({ port: cfg.port, host: cfg.host });
console.log(`ZGE Menedżer: http://localhost:${cfg.port}  (dane: ${cfg.dbPath})`);

// Demo ma zmyślone dane, więc kopii nie robimy; prawdziwa aplikacja robi jedną kopię dziennie.
const backups = cfg.demo
  ? undefined
  : new BackupScheduler(
      new DatabaseBackup(db, cfg.backupDir, cfg.backupKeep),
      () => warsawDate(),
      console.error,
    );
backups?.start();
if (backups) console.log(`Kopie bazy: ${cfg.backupDir} (ostatnie ${cfg.backupKeep})`);

/** Kalendarz Google tylko wtedy, gdy w .env są klucze z Google Cloud (inaczej sekcja w Ustawieniach to wyjaśnia). */
function googleCalendar(config: Config) {
  if (!config.google) return undefined;
  const account = new GoogleOAuth({
    ...config.google,
    // Adres powrotu po zalogowaniu w Google: ten komputer, port aplikacji (klient OAuth typu „Desktop app”).
    redirectUri: `http://127.0.0.1:${config.port}/kalendarz-google/oauth`,
    fetchFn: fetch,
    store: new FileTokenStore(config.googleTokenFile),
  });
  return { account, api: new GoogleCalendarApi(fetch, () => account.accessToken()) };
}

const shutdown = async () => {
  backups?.stop();
  await app.close();
  db.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
