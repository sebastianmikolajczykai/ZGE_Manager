import { loadConfig } from './config.js';
import { AppDatabase } from './db.js';
import { buildApp } from './app.js';
import { WorkTypeRepository } from './modules/work-types/work-type-repository.js';
import { DEFAULT_WORK_TYPES } from './modules/work-types/default-work-types.js';

const cfg = loadConfig(process.env);
const db = AppDatabase.open(cfg.dbPath);
db.migrate();
new WorkTypeRepository(db).seedDefaults(DEFAULT_WORK_TYPES);
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
