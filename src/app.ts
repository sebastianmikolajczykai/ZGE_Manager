import Fastify, { type FastifyInstance } from 'fastify';
import type { Pool } from 'pg';

export interface AppDeps {
  pool: Pool;
}

export function buildApp({ pool }: AppDeps): FastifyInstance {
  const app = Fastify({ logger: false });

  app.get('/health', async (_req, reply) => {
    try {
      await pool.query('SELECT 1');
      return { status: 'ok', db: 'ok' };
    } catch {
      return reply.code(503).send({ status: 'error', db: 'down' });
    }
  });

  app.get('/', async (_req, reply) => {
    reply.type('text/html; charset=utf-8');
    return `<!doctype html><html lang="pl"><head><meta charset="utf-8"><title>ZGE: lista zleceń</title></head><body><h1>ZGE: lista zleceń</h1></body></html>`;
  });

  return app;
}
