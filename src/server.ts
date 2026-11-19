import { loadConfig } from './config.js';
import { AppDatabase } from './db.js';
import { buildApp } from './app.js';
import { warsawDate } from './clock.js';
import { seedDemo } from './demo/demo-seed.js';

const cfg = loadConfig(process.env);
const db = AppDatabase.open(cfg.dbPath);
db.migrate();
const app = buildApp({ db });
if (cfg.demo) seedDemo(db, warsawDate()); // tylko demo: zmyślone zlecenia w pustej bazie
await app.listen({ port: cfg.port, host: cfg.host });
console.log(`ZGE Menedżer: http://localhost:${cfg.port}  (dane: ${cfg.dbPath})`);

const shutdown = async () => {
  await app.close();
  db.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
