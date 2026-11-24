import path from 'node:path';

const DEFAULT_BACKUP_KEEP = 30;

export interface Config {
  dbPath: string;
  port: number;
  host: string;
  /** Tryb pokazowy: pusta baza dostaje zmyślone zlecenia (tylko demo na Renderze). */
  demo: boolean;
  /** Folder na codzienne kopie bazy (najlepiej inny dysk lub OneDrive). */
  backupDir: string;
  /** Ile najnowszych kopii trzymać; starsze są usuwane. */
  backupKeep: number;
}

/** Domyślnie: dane w pliku dane/zge.db obok aplikacji, serwer widoczny tylko z tego komputera. */
export function loadConfig(env: Record<string, string | undefined>): Config {
  return {
    dbPath: path.resolve(env.DB_PATH ?? 'dane/zge.db'),
    port: positiveInteger('PORT', env.PORT, 3000),
    host: env.HOST ?? '127.0.0.1',
    demo: env.ZGE_DEMO === '1',
    backupDir: path.resolve(env.BACKUP_DIR ?? 'dane/kopie'),
    backupKeep: positiveInteger('BACKUP_KEEP', env.BACKUP_KEEP, DEFAULT_BACKUP_KEEP),
  };
}

function positiveInteger(name: string, raw: string | undefined, fallback: number): number {
  const value = raw === undefined ? fallback : Number(raw);
  if (!Number.isInteger(value) || value <= 0) throw new Error(`Nieprawidłowy ${name}: ${raw}`);
  return value;
}
