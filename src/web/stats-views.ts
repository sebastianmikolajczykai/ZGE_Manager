import { html, type SafeHtml } from './html.js';
import { formatDate, formatPrice } from './view-helpers.js';
import type { ClientStats, MonthStats, StatsSummary } from '../modules/stats/stats-service.js';

const MONTH_NAMES = [
  'styczeń',
  'luty',
  'marzec',
  'kwiecień',
  'maj',
  'czerwiec',
  'lipiec',
  'sierpień',
  'wrzesień',
  'październik',
  'listopad',
  'grudzień',
];
const PERCENT = 100;

/** Zakładka Statystyki: kafelki z sumami, tabela miesięcy z paskami dochodu, lista klientów. */
export function statsPage(summary: StatsSummary, clients: ClientStats[]): SafeHtml {
  return html`<div class="page-head">
      <h1>Statystyki</h1>
      <p class="page-sub">Klienci i dochód firmy w jednym miejscu</p>
    </div>
    ${statTiles(summary)}
    <h2 class="section-head">Miesiące</h2>
    ${monthsTable(summary.months)}
    <h2 class="section-head">Klienci (${clients.length})</h2>
    ${clients.length === 0 ? html`<p class="empty">Brak klientów. Pojawią się po dodaniu pierwszego zlecenia.</p>` : clientsTable(clients)}
    ${howWeCount(summary.paidWithoutPrice)}`;
}

function statTiles(s: StatsSummary): SafeHtml {
  const tile = (kind: string, icon: string, value: string | number, label: string) =>
    html`<div class="stat ${kind}">
      <span class="ti" aria-hidden="true">${icon}</span><b>${value}</b><span>${label}</span>
    </div>`;
  const newThisMonth = s.months[0]?.newClients ?? 0;
  return html`<div class="stats">
    ${tile('clients', '👥', s.totalClients, 'Wszyscy klienci')}
    ${tile('new', '✨', newThisMonth, 'Nowi klienci w tym miesiącu')}
    ${tile('income', '💵', formatPrice(s.incomeThisMonthPln), 'Dochód w tym miesiącu')}
    ${tile('total', '🏦', formatPrice(s.incomeTotalPln), 'Dochód łącznie')}
    ${tile('unpaid', '⏳', formatPrice(s.unpaidPln), 'Czeka na zapłatę')}
    ${tile('progress', '🛠', formatPrice(s.inProgressPln), 'W realizacji')}
  </div>`;
}

function monthsTable(months: MonthStats[]): SafeHtml {
  const best = Math.max(0, ...months.map((m) => m.incomePln));
  const width = (value: number) => (best > 0 ? Math.round((value / best) * PERCENT) : 0);
  return html`<table class="months">
    <thead>
      <tr>
        <th>Miesiąc</th>
        <th>Dochód</th>
        <th class="num">Zapłacone zlecenia</th>
        <th class="num">Nowi klienci</th>
        <th class="num">Przyjęte zlecenia</th>
        <th class="num">Oferty wysłane / przyjęte</th>
      </tr>
    </thead>
    <tbody>
      ${months.map(
        (m) =>
          html`<tr>
            <td>${monthName(m.month)}</td>
            <td class="income">
              <span class="income-bar"><span style="width:${width(m.incomePln)}%"></span></span>
              <b>${formatPrice(m.incomePln)}</b>
            </td>
            <td class="num">${m.paidOrders}</td>
            <td class="num">${m.newClients}</td>
            <td class="num">${m.orders}</td>
            <td class="num">${m.offersSent} / ${m.offersAccepted}</td>
          </tr>`,
      )}
    </tbody>
  </table>`;
}

function clientsTable(clients: ClientStats[]): SafeHtml {
  return html`<div class="toolbar">
      <input
        type="search"
        id="szukaj"
        aria-label="Szukaj klienta"
        placeholder="Szukaj klienta lub telefonu…"
      />
    </div>
    <table data-search-list>
      <thead>
        <tr>
          <th>Klient</th>
          <th>Telefon</th>
          <th class="num">Zlecenia</th>
          <th class="num">Zapłacono</th>
          <th>Pierwsze zlecenie</th>
          <th>Ostatnie zlecenie</th>
        </tr>
      </thead>
      <tbody>
        ${clients.map(
          (c) =>
            html`<tr>
              <td>${c.name}</td>
              <td><a href="tel:${c.phone}">${c.phone}</a></td>
              <td class="num">${c.orders}</td>
              <td class="num">${formatPrice(c.paidPln)}</td>
              <td>${formatDate(c.firstOrderOn)}</td>
              <td><a href="/?zlecenie=${c.lastOrderId}">${formatDate(c.lastOrderOn)}</a></td>
            </tr>`,
        )}
      </tbody>
    </table>
    <p class="empty" id="brak-wynikow" hidden>Nic nie pasuje do wyszukiwania.</p>`;
}

function howWeCount(paidWithoutPrice: number): SafeHtml {
  return html`<details class="how">
    <summary>Jak liczymy?</summary>
    <ul>
      <li><b>Klient</b> to numer telefonu: kilka zleceń z tym samym numerem = jeden klient.</li>
      <li><b>Nowy klient</b> liczy się w miesiącu jego pierwszego zlecenia.</li>
      <li>
        <b>Dochód</b> to suma cen zleceń oznaczonych „Zapłacone”, w miesiącu kliknięcia „Zapłacone” (kwoty
        tak, jak wpisano je w cenie zlecenia).
      </li>
      <li>
        <b>Czeka na zapłatę</b>: zlecenia w zakładce Niezapłacone. <b>W realizacji</b>: reszta otwartych
        zleceń.
      </li>
    </ul>
    ${paidWithoutPrice > 0 ? html`<p class="late">Uwaga: ${paidWithoutPrice} ${paidOrdersWord(paidWithoutPrice)} bez wpisanej ceny (nie wlicza się do dochodu).</p>` : ''}
  </details>`;
}

/** „2026-11” → „listopad 2026”. */
function monthName(month: string): string {
  const [year, number] = month.split('-');
  return `${MONTH_NAMES[Number(number) - 1] ?? month} ${year}`;
}

/** Odmiana: 1 zapłacone zlecenie, 2–4 zapłacone zlecenia, 5+ zapłaconych zleceń. */
function paidOrdersWord(n: number): string {
  if (n === 1) return 'zapłacone zlecenie';
  const lastDigit = n % 10;
  const lastTwo = n % 100;
  const few = lastDigit >= 2 && lastDigit <= 4 && (lastTwo < 12 || lastTwo > 14);
  return few ? 'zapłacone zlecenia' : 'zapłaconych zleceń';
}
