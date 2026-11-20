import { html, type SafeHtml } from './html.js';
import { formatDate, formatPrice, personButtons, personTag, rowClass, statusChip } from './view-helpers.js';
import { historySection } from './views.js';
import type { UnpaidRow } from '../modules/payments/payment-service.js';
import type { HistoryEntry } from '../modules/orders/order-service.js';
import type { Person } from '../modules/people/people-repository.js';
import type { Urgency } from '../modules/urgency/urgency-rules.js';

const UNPAID_LABEL = {
  green: 'czekamy na zapłatę',
  yellow: 'jutro przypomnij o zapłacie',
  red: 'zadzwoń i przypomnij o zapłacie',
} as const;
/** Krótka etykieta w tabeli (pełne zdanie jest na karcie). */
const UNPAID_SHORT = { green: 'czekamy', yellow: 'jutro przypomnij', red: 'przypomnij' } as const;

/** Zakładka Niezapłacone: lista po lewej, karta wybranego zlecenia po prawej. */
export function unpaidPage(
  rows: UnpaidRow[],
  detail: SafeHtml | null,
  error: string | null,
  selectedId: number | null = null,
): SafeHtml {
  return html` ${error ? html`<p class="error" role="alert">${error}</p>` : ''}
    <div class="page-head"><h1>Niezapłacone</h1></div>
    ${rows.length > 0 ? unpaidSummary(rows) : ''}
    <div class="split">
      <section class="board" aria-label="Lista niezapłaconych">
        ${rows.length === 0 ? html`<p class="empty">Brak niezapłaconych zleceń.</p>` : unpaidTable(rows, selectedId)}
      </section>
      ${detail ?? html`<section class="detail placeholder" aria-label="Szczegóły zapłaty"><p>Kliknij klienta na liście, żeby zobaczyć szczegóły.</p></section>`}
    </div>`;
}

/** Suma kwot do zapłaty i liczba klientów, którym dziś trzeba przypomnieć. */
function unpaidSummary(rows: UnpaidRow[]): SafeHtml {
  const total = rows.reduce((sum, r) => sum + (r.pricePln ?? 0), 0);
  const withoutPrice = rows.filter((r) => r.pricePln === null).length;
  const toRemind = rows.filter((r) => r.urgency.colour === 'red').length;
  return html`<div class="summary">
    <div>
      <span>Razem do zapłaty</span
      ><b>${formatPrice(total)}</b
      >${withoutPrice > 0 ? html`<small>(${withoutPrice} bez wpisanej kwoty)</small>` : ''}
    </div>
    <div><span>Do przypomnienia dziś</span><b class="${toRemind > 0 ? 'late' : ''}">${toRemind}</b></div>
  </div>`;
}

function unpaidTable(rows: UnpaidRow[], selectedId: number | null): SafeHtml {
  return html`<table>
    <thead>
      <tr>
        <th>Status</th>
        <th>Klient</th>
        <th>Miejscowość</th>
        <th class="num">Kwota</th>
        <th>Oddane klientowi</th>
        <th class="num">Dni bez zapłaty</th>
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
            <td>${statusChip(r.urgency.colour, UNPAID_SHORT[r.urgency.colour])}</td>
            <td><a href="/niezaplacone?zlecenie=${r.orderId}">${r.clientName}</a></td>
            <td>${r.town}</td>
            <td class="num">${formatPrice(r.pricePln)}</td>
            <td>${formatDate(r.handedOverOn)}</td>
            <td class="num"><b>${r.daysSinceContact}</b></td>
            <td>${personTag(r.lastPerson)}</td>
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
    <div class="detail-head">
      <h2>${row.clientName}</h2>
      ${statusChip(urgency.colour, UNPAID_LABEL[urgency.colour])}
    </div>
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
    <div class="offer-call">
      <p class="now-label">CO TERAZ · 📞 PRZYPOMNIENIE O ZAPŁACIE</p>
      ${personButtons(`/niezaplacone/${row.orderId}/rozmowa`, 'Rozmowa', people, 'secondary', noteField)}
    </div>
    <h3>Klient zapłacił</h3>
    ${personButtons(`/niezaplacone/${row.orderId}/zaplacone`, 'Zapłacone', people, 'primary')}
    <p><a class="button secondary" href="/?zlecenie=${row.orderId}">Pełna karta zlecenia →</a></p>
    ${historySection(history)}
  </section>`;
}
