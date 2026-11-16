import { loadConfig } from './config.js';
import { createPool, migrate } from './db.js';
import { buildApp } from './app.js';

const cfg = loadConfig(process.env);
const pool = createPool(cfg.databaseUrl);
await migrate(pool);
const app = buildApp({ pool });
await app.listen({ port: cfg.port, host: '0.0.0.0' });
console.log(`ZGE lista zleceń: http://localhost:${cfg.port}`);
