import path from 'node:path';

export interface Config {
  dbPath: string;
  port: number;
  host: string;
  /** Tryb pokazowy: pusta baza dostaje zmyślone zlecenia (tylko demo na Renderze). */
  demo: boolean;
}

/** Domyślnie: dane w pliku dane/zge.db obok aplikacji, serwer widoczny tylko z tego komputera. */
export function loadConfig(env: Record<string, string | undefined>): Config {
  const port = env.PORT === undefined ? 3000 : Number(env.PORT);
  if (!Number.isInteger(port) || port <= 0) throw new Error(`Nieprawidłowy PORT: ${env.PORT}`);
  return {
    dbPath: path.resolve(env.DB_PATH ?? 'dane/zge.db'),
    port,
    host: env.HOST ?? '127.0.0.1',
    demo: env.ZGE_DEMO === '1',
  };
}
