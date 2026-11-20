import { html, type SafeHtml } from './html.js';
import type { Person } from '../modules/people/people-repository.js';
import type { Urgency } from '../modules/urgency/urgency-rules.js';

/** Drobne elementy wspólne dla ekranów zleceń i ofert. */

/** Przyciski „{etykieta}: {osoba}” w jednym formularzu; `fields` = dodatkowe pola (np. notatka). */
export function personButtons(
  action: string,
  label: string,
  people: Person[],
  style: string,
  fields: SafeHtml | null = null,
): SafeHtml {
  if (people.length === 0) return html`<p class="error">Dodaj osoby w Ustawieniach.</p>`;
  return html`<form method="post" action="${action}" class="people">
    ${fields}
    ${people.map(
      (p) => html`<button class="${style}" name="person" value="${p.name}">${label}: ${p.name}</button>`,
    )}
  </form>`;
}

export function rowClass(u: Urgency): string {
  return `c-${u.colour}${u.blink ? ' blink' : ''}`;
}

export function formatPrice(pln: number | null): string {
  if (pln === null) return '–';
  const decimals = Number.isInteger(pln) ? 0 : 2;
  return `${pln.toLocaleString('pl-PL', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })} zł`;
}

export function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return y && m && d ? `${d}.${m}.${y}` : iso;
}
