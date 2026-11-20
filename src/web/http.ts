import type { FastifyReply } from 'fastify';
import type { SafeHtml } from './html.js';
import { layout } from './views.js';

/** Pola formularza po odczytaniu (nazwa → wartość). */
export type Form = Record<string, string>;

export const HTTP_SEE_OTHER = 303;
export const HTTP_BAD_REQUEST = 400;
export const HTTP_FORBIDDEN = 403;
export const HTTP_NOT_FOUND = 404;

export function sendPage(reply: FastifyReply, title: string, body: SafeHtml, status = 200) {
  return reply.code(status).type('text/html; charset=utf-8').send(layout(title, body));
}

export function message(err: unknown): string {
  return err instanceof Error ? err.message : 'Nieznany błąd';
}

/** Pole opcjonalne: pusty tekst = brak wartości. */
export function optionalField(f: Form, key: string): string | null {
  return f[key]?.trim() ? (f[key] as string) : null;
}

/** Cena wpisana np. „2 500,50” → 2500.5. */
export function priceField(f: Form): number | null {
  const price = optionalField(f, 'pricePln');
  return price === null ? null : Number(price.replace(',', '.').replace(/\s/g, ''));
}
