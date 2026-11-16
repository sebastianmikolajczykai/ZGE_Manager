export interface Config {
  databaseUrl: string;
  port: number;
}

export function loadConfig(env: Record<string, string | undefined>): Config {
  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl) throw new Error('Brak zmiennej DATABASE_URL');
  const port = env.PORT === undefined ? 3000 : Number(env.PORT);
  if (!Number.isInteger(port) || port <= 0) throw new Error(`Nieprawidłowy PORT: ${env.PORT}`);
  return { databaseUrl, port };
}
