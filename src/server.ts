import { loadConfig } from './config.js';
import { openDb, migrate } from './db.js';
import { buildApp } from './app.js';

const cfg = loadConfig(process.env);
const db = openDb(cfg.dbPath);
migrate(db);
const app = buildApp({ db });
await app.listen({ port: cfg.port, host: cfg.host });
console.log(`ZGE Menedżer: http://localhost:${cfg.port}  (dane: ${cfg.dbPath})`);

const shutdown = async () => {
  await app.close();
  db.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
