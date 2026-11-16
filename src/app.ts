import Fastify, { type FastifyInstance } from 'fastify';
import type { Db } from './db.js';

export interface AppDeps {
  db: Db;
}

export function buildApp({ db }: AppDeps): FastifyInstance {
  const app = Fastify({ logger: false });

  app.get('/health', async (_req, reply) => {
    try {
      db.prepare('SELECT 1').get();
      return { status: 'ok', db: 'ok' };
    } catch {
      return reply.code(503).send({ status: 'error', db: 'down' });
    }
  });

  app.get('/', async (_req, reply) => {
    reply.type('text/html; charset=utf-8');
    return `<!doctype html><html lang="pl"><head><meta charset="utf-8"><title>ZGE Menedżer</title></head><body><h1>ZGE Menedżer</h1></body></html>`;
  });

  return app;
}
