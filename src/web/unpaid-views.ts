import { html, type SafeHtml } from './html.js';
import { formatDate, formatPrice, personButtons, rowClass } from './view-helpers.js';
import { historyText } from './views.js';
import type { UnpaidRow } from '../modules/payments/payment-service.js';
import type { HistoryEntry } from '../modules/orders/order-service.js';
import type { Person } from '../modules/people/people-repository.js';
import type { Urgency } from '../modules/urgency/urgency-rules.js';

const UNPAID_LABEL = {
  green: 'czekamy na zapłatę',
  yellow: 'jutro przypomnij o zapłacie',
  red: 'zadzwoń i przypomnij o zapłacie',
} as const;

/** Zakładka Niezapłacone: lista po lewej, karta wybranego zlecenia po prawej. */
export function unpaidPage(
  rows: UnpaidRow[],
  detail: SafeHtml | null,
  error: string | null,
  selectedId: number | null = null,
): SafeHtml {
  return html` ${error ? html`<p class="error" role="alert">${error}</p>` : ''}
    <div class="split">
      <section class="board" aria-label="Lista niezapłaconych">
        ${rows.length === 0 ? html`<p class="empty">Brak niezapłaconych zleceń.</p>` : unpaidTable(rows, selectedId)}
      </section>
      ${detail ?? html`<section class="detail placeholder" aria-label="Szczegóły zapłaty"><p>Kliknij klienta na liście, żeby zobaczyć szczegóły.</p></section>`}
    </div>`;
}

function unpaidTable(rows: UnpaidRow[], selectedId: number | null): SafeHtml {
  return html`<table>
    <thead>
      <tr>
        <th>Klient</th>
        <th>Miejscowość</th>
        <th>Kwota</th>
        <th>Oddane klientowi</th>
        <th>Dni bez zapłaty</th>
        <th>Kto</th>
      </tr>
    </thead>
    <tbody>
      ${rows.map(
        (r) =>
          html`<tr
            class="${rowClass(r.urgency)}${r.orderId === selectedId ? ' selected' : ''}"
            onclick="location.href='/niezaplacone?zlecenie=${r.orderId}'"
          >
            <td><a href="/niezaplacone?zlecenie=${r.orderId}">${r.clientName}</a></td>
            <td>${r.town}</td>
            <td class="num">${formatPrice(r.pricePln)}</td>
            <td>${formatDate(r.handedOverOn)}</td>
            <td class="num">
              ${r.daysSinceContact}${r.urgency.colour === 'green' ? '' : html`<br /><small>${UNPAID_LABEL[r.urgency.colour]}</small>`}
            </td>
            <td>${r.lastPerson ?? '–'}</td>
          </tr>`,
      )}
    </tbody>
  </table>`;
}

export function unpaidDetail(
  row: UnpaidRow,
  urgency: Urgency,
  history: HistoryEntry[],
  people: Person[],
): SafeHtml {
  const noteField = html`<label
    >Notatka z rozmowy <small>(opcjonalnie)</small><textarea name="note"></textarea>
  </label>`;
  return html`<section class="detail" aria-label="Szczegóły zapłaty">
    <h2>${row.clientName}</h2>
    <p class="status ${rowClass(urgency)}">${UNPAID_LABEL[urgency.colour]}</p>
    <dl>
      <dt>Telefon</dt>
      <dd><a href="tel:${row.phone}">${row.phone}</a></dd>
      <dt>Miejscowość</dt>
      <dd>${row.town}</dd>
      <dt>Kwota</dt>
      <dd>${formatPrice(row.pricePln)}</dd>
      <dt>Oddane klientowi</dt>
      <dd>${formatDate(row.handedOverOn)}</dd>
      <dt>Ostatni kontakt</dt>
      <dd>${formatDate(row.lastContactOn)}</dd>
    </dl>
    <h3>Przypomnienie o zapłacie</h3>
    <div class="offer-call">
      ${personButtons(`/niezaplacone/${row.orderId}/rozmowa`, 'Rozmowa', people, 'secondary', noteField)}
    </div>
    <h3>Klient zapłacił</h3>
    ${personButtons(`/niezaplacone/${row.orderId}/zaplacone`, 'Zapłacone', people, 'primary')}
    <p><a href="/?zlecenie=${row.orderId}">Pełna karta zlecenia →</a></p>
    <h3>Historia</h3>
    <ul class="history">
      ${[...history].reverse().map((h) => html`<li><time>${formatDate(h.happenedOn)}</time> ${historyText(h)}</li>`)}
    </ul>
  </section>`;
}
