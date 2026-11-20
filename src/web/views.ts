import { html, SafeHtml } from './html.js';
import { googleCalendarLink } from '../modules/calendar/google-calendar-link.js';
import { fold, formatDate, formatPrice, personButtons, rowClass } from './view-helpers.js';
import type { BoardRow } from '../modules/board/board-service.js';
import type { HistoryEntry, Order, OrderStep } from '../modules/orders/order-service.js';
import type { Person } from '../modules/people/people-repository.js';
import type { WorkType } from '../modules/work-types/work-type-repository.js';
import type { Urgency } from '../modules/urgency/urgency-rules.js';

/** Domyślnie co ile sekund odświeżać listy (zmienia się w Ustawieniach). */
const DEFAULT_REFRESH_SECONDS = 60;
const MS_PER_SECOND = 1000;
const COLOUR_LABEL = { green: 'w terminie', yellow: 'ostatni dzień', red: 'po terminie' } as const;

export function layout(title: string, body: SafeHtml, refreshSeconds = DEFAULT_REFRESH_SECONDS): string {
  return html`<!doctype html>
    <html lang="pl">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>${title}</title>
        <style>
          ${TRUSTED_STYLES}
        </style>
      </head>
      <body>
        <header class="top">
          <div class="brand">
            <span class="logo" role="img" aria-label="Geodezja-ZGE"
              ><span class="logo-top">GEODEZJA</span><span class="logo-zge">ZGE</span></span
            ><span class="app">ZGE Menedżer</span>
          </div>
          <nav>
            <a href="/">Tablica</a><a href="/oferty">Oferty</a><a href="/niezaplacone">Niezapłacone</a
            ><a class="primary" href="/zlecenia/nowe">+ Dodaj zlecenie</a><a href="/ustawienia">Ustawienia</a>
          </nav>
        </header>
        <main>${body}</main>
        <script>
          ${trustedScript(refreshSeconds)};
        </script>
      </body>
    </html>`.value;
}

export function boardPage(
  rows: BoardRow[],
  detail: SafeHtml | null,
  error: string | null,
  selectedId: number | null = null,
): SafeHtml {
  return html` ${error ? html`<p class="error" role="alert">${error}</p>` : ''}
    <div class="split">
      <section class="board" aria-label="Lista zleceń">
        ${rows.length === 0 ? html`<p class="empty">Brak aktywnych zleceń. Dodaj pierwsze przyciskiem „+ Dodaj zlecenie”.</p>` : boardTable(rows, selectedId)}
      </section>
      ${detail ?? html`<section class="detail placeholder" aria-label="Szczegóły zlecenia"><p>Kliknij klienta na liście, żeby zobaczyć etap i co dalej.</p></section>`}
    </div>`;
}

function boardTable(rows: BoardRow[], selectedId: number | null): SafeHtml {
  return html`<table>
    <thead>
      <tr>
        <th>Klient</th>
        <th>Miejscowość / działka</th>
        <th>Rodzaj pracy</th>
        <th>Bieżący krok</th>
        <th>Dni na kroku</th>
        <th>Ostatnio</th>
        <th>Cena</th>
      </tr>
    </thead>
    <tbody>
      ${rows.map(
        (r) =>
          html`<tr
            class="${rowClass(r.urgency)}${r.orderId === selectedId ? ' selected' : ''}"
            onclick="location.href='/?zlecenie=${r.orderId}'"
          >
            <td><a href="/?zlecenie=${r.orderId}">${r.clientName}</a></td>
            <td>${r.town}${r.plot ? html`<br /><small>dz. ${r.plot}</small>` : ''}</td>
            <td>${r.workTypeName}</td>
            <td>${r.currentStepName} <small>(${r.currentStepPosition}/${r.stepCount})</small></td>
            <td class="num">
              ${r.daysOnStep}${r.urgency.daysOverdue > 0 ? html`<br /><small>${r.urgency.daysOverdue} po terminie</small>` : ''}
            </td>
            <td>${r.lastPerson ?? '–'}</td>
            <td class="num">${formatPrice(r.pricePln)}</td>
          </tr>`,
      )}
    </tbody>
  </table>`;
}

export function orderDetail(
  order: Order,
  workTypeName: string,
  urgency: Urgency | null,
  history: HistoryEntry[],
  people: Person[],
): SafeHtml {
  return html`<section class="detail" aria-label="Szczegóły zlecenia">
    <h2>${order.clientName}</h2>
    <p class="status ${urgency ? rowClass(urgency) : 'done'}">
      ${order.status === 'completed' ? 'Zlecenie zakończone' : urgency ? COLOUR_LABEL[urgency.colour] : ''}
    </p>
    <dl>
      <dt>Telefon</dt>
      <dd><a href="tel:${order.phone}">${order.phone}</a></dd>
      <dt>Miejscowość</dt>
      <dd>${order.town}${order.plot ? html`, dz. ${order.plot}` : ''}</dd>
      <dt>Rodzaj pracy</dt>
      <dd>${workTypeName}</dd>
      ${
        order.office
          ? html`<dt>Gmina / urząd</dt>
              <dd>${order.office}</dd>`
          : ''
      }
      <dt>Cena</dt>
      <dd>${formatPrice(order.pricePln)}</dd>
      ${
        order.measurementOn
          ? html`<dt>Pomiar</dt>
              <dd>
                ${formatDate(order.measurementOn)}
                ${order.status === 'active' ? calendarButton(order, workTypeName) : ''}
              </dd>`
          : ''
      }
      <dt>Przyjęte</dt>
      <dd>${formatDate(order.receivedOn)}</dd>
      ${
        order.note
          ? html`<dt>Notatka</dt>
              <dd>${order.note}</dd>`
          : ''
      }
    </dl>
    <h3>Kroki</h3>
    ${stepsSection(order, people)} ${historySection(history)}
  </section>`;
}

/** Przycisk „Dodaj do Kalendarza Google” z terminem pomiaru (otwiera formularz Google w nowej karcie). */
function calendarButton(order: Order, workTypeName: string): SafeHtml {
  const place = order.plot ? `${order.town}, dz. ${order.plot}` : order.town;
  const link = googleCalendarLink({
    title: `Pomiar: ${order.clientName}, ${order.town}`,
    date: order.measurementOn ?? '',
    location: place,
    details: [
      `Telefon: ${order.phone}`,
      `Rodzaj pracy: ${workTypeName}`,
      `Zlecenie nr ${order.id} w ZGE Menedżerze`,
    ].join('\n'),
  });
  return html`<a class="button secondary small" href="${link}" target="_blank" rel="noopener"
    ><span aria-hidden="true">📅</span> Dodaj do Kalendarza Google</a
  >`;
}

/** Zrobione kroki zwinięte pod strzałką, aktywny i kolejne widoczne (z oryginalnymi numerami). */
function stepsSection(order: Order, people: Person[]): SafeHtml {
  const done = order.steps.filter((s) => s.status === 'done');
  const open = order.steps.filter((s) => s.status !== 'done');
  const list = (steps: OrderStep[]) =>
    html`<ol class="steps">
      ${steps.map((s) => stepItem(order, s, people))}
    </ol>`;
  return html`${done.length > 0 ? fold('steps-done', `Zrobione kroki (${done.length})`, list(done)) : ''}
  ${open.length > 0 ? list(open) : ''} ${done.length > 0 ? undoForm(order.id, people) : ''}`;
}

/** Historia zlecenia (najnowsze na górze), zwijana. Używana też w zakładce Niezapłacone. */
export function historySection(history: HistoryEntry[]): SafeHtml {
  return fold(
    'history',
    `Historia (${history.length})`,
    html`<ul class="history">
      ${[...history].reverse().map((h) => html`<li><time>${formatDate(h.happenedOn)}</time> ${historyText(h)}</li>`)}
    </ul>`,
  );
}

function stepItem(order: Order, step: OrderStep, people: Person[]): SafeHtml {
  const meta =
    step.status === 'done'
      ? html`<small>zrobione ${formatDate(step.doneOn ?? '')}, ${step.doneBy}</small>`
      : step.limitDays
        ? html`<small
            >limit ${step.limitDays} dni rob.${step.provisional ? ' (do potwierdzenia)' : ''}</small
          >`
        : '';
  const actions =
    step.status === 'active'
      ? html`<div class="actions">
          ${step.kind === 'daily' ? personButtons(`/zlecenia/${order.id}/kroki/${step.position}/sprawdzone`, 'Sprawdzone dziś', people, 'secondary') : ''}
          ${personButtons(`/zlecenia/${order.id}/kroki/${step.position}/zrobione`, step.kind === 'daily' ? 'Zakończone' : 'Zrobione', people, 'primary')}
          ${step.lastCheckedOn ? html`<small>ostatnio sprawdzone ${formatDate(step.lastCheckedOn)}, ${step.lastCheckedBy}</small>` : ''}
        </div>`
      : '';
  return html`<li value="${step.position}" class="step ${step.status}">
    <span class="name">${step.name}</span> ${meta}${actions}
  </li>`;
}

function undoForm(orderId: number, people: Person[]): SafeHtml {
  return html`<details class="undo">
    <summary class="button undo-toggle">
      <span aria-hidden="true">↶</span> Cofnij ostatnie odhaczenie (pomyłka)
    </summary>
    ${personButtons(`/zlecenia/${orderId}/cofnij`, 'Cofnij', people, 'danger')}
  </details>`;
}

export function historyText(h: HistoryEntry): SafeHtml {
  const step = h.stepName ? html` „${h.stepName}”` : '';
  switch (h.action) {
    case 'created':
      return html`${h.person}: przyjęcie zlecenia`;
    case 'step_done':
      return html`${h.person}: zrobione${step}`;
    case 'checked':
      return html`${h.person}: sprawdzone dziś${step}`;
    case 'undone':
      return html`${h.person}: cofnięcie${step}`;
    case 'payment_call':
      return html`${h.person}: przypomnienie o zapłacie${h.note ? html` (${h.note})` : ''}`;
  }
}

export interface OrderFormValues {
  [field: string]: string;
}

export function orderForm(
  workTypes: WorkType[],
  people: Person[],
  values: OrderFormValues,
  error: string | null,
): SafeHtml {
  const v = (name: string) => values[name] ?? '';
  return html`<section class="form-page">
    <h2>Nowe zlecenie</h2>
    ${error ? html`<p class="error" role="alert">${error}</p>` : ''}
    <form method="post" action="/zlecenia" class="order-form">
      ${v('offerId') ? html`<input type="hidden" name="offerId" value="${v('offerId')}" />` : ''}
      <label>Klient <input name="clientName" required value="${v('clientName')}" /></label>
      <label>Telefon <input name="phone" required inputmode="tel" value="${v('phone')}" /></label>
      <label>Miejscowość <input name="town" required value="${v('town')}" /></label>
      <label
        >Rodzaj pracy
        <select name="workTypeId">
          ${workTypes.map(
            (w) =>
              html`<option value="${w.id}" ${v('workTypeId') === String(w.id) ? 'selected' : ''}>
                ${w.name}
              </option>`,
          )}
        </select></label
      >
      <label>Data pomiaru <input type="date" name="measurementOn" value="${v('measurementOn')}" /></label>
      <label>Nr działki <small>(opcjonalnie)</small> <input name="plot" value="${v('plot')}" /></label>
      <label>Gmina / urząd <small>(opcjonalnie)</small> <input name="office" value="${v('office')}" /></label>
      <label
        >Cena w zł <small>(opcjonalnie)</small>
        <input name="pricePln" inputmode="decimal" value="${v('pricePln')}"
      /></label>
      <label>Notatka <small>(opcjonalnie)</small> <textarea name="note">${v('note')}</textarea></label>
      <label
        >Kto przyjął
        <select name="person">
          ${people.map((p) => html`<option ${v('person') === p.name ? 'selected' : ''}>${p.name}</option>`)}
        </select></label
      >
      <button class="primary big">Zapisz zlecenie</button>
    </form>
  </section>`;
}

const PAGE_SCRIPT = `
// Zwijane sekcje (data-fold) pamiętają w przeglądarce, czy są rozwinięte, także po odświeżeniu.
document.querySelectorAll('details[data-fold]').forEach(function (d) {
  var key = 'fold:' + d.getAttribute('data-fold');
  try { if (localStorage.getItem(key) === 'open') d.open = true; } catch (e) {}
  d.addEventListener('toggle', function () {
    try { localStorage.setItem(key, d.open ? 'open' : 'closed'); } catch (e) {}
  });
});
setInterval(function () {
  var busy = document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
  var openForm = document.querySelector('details[open]:not(.fold)');
  if (!busy && !openForm && ['/', '/oferty', '/niezaplacone'].indexOf(location.pathname) >= 0) location.reload();
}, REFRESH_MS);`;

const STYLES = `
:root { --ink:#1d2733; --muted:#5b6876; --line:#d7dde4; --bg:#f4f6f8; --brand:#189400; --brand-light:#24b109; --header:#000;
  --green:#e3f3e6; --green-ink:#1e6b34; --yellow:#fff1bf; --yellow-ink:#7a5a00; --red:#fbd9d7; --red-ink:#a3201a; }
* { box-sizing:border-box; }
body { margin:0; font:18px/1.4 system-ui, "Segoe UI", sans-serif; color:var(--ink); background:var(--bg); }
/* Kolory i znak firmowy jak na geodezja-zge.pl: czarny pasek, zielone akcenty, logo w ramce. */
.top { display:flex; justify-content:space-between; align-items:center; padding:10px 20px; background:var(--header); color:#fff; }
.brand { display:flex; align-items:center; }
.logo { display:inline-grid; border:2px solid #fff; padding:2px 8px 4px; margin-right:16px; line-height:1; font-weight:700; letter-spacing:.04em; }
.logo-top { font-size:15px; text-align:right; } .logo-zge { font-size:22px; border:2px solid #fff; padding:1px 4px; justify-self:start; margin-top:3px; }
.brand .app { font-size:20px; font-weight:600; }
nav a { color:var(--brand-light); margin-left:18px; text-decoration:none; font-weight:700; text-transform:uppercase; font-size:16px; }
nav a.primary { background:var(--brand); color:#fff; padding:8px 14px; border-radius:6px; }
main { padding:16px 20px; }
.split { display:grid; grid-template-columns: 3fr 2fr; gap:16px; align-items:start; }
table { width:100%; border-collapse:collapse; background:#fff; }
th, td { padding:10px 12px; border-bottom:1px solid var(--line); text-align:left; vertical-align:top; }
th { background:#e9edf1; font-size:15px; text-transform:uppercase; letter-spacing:.03em; color:var(--muted); }
tbody tr { cursor:pointer; } td a { color:inherit; font-weight:700; text-decoration:none; }
td.num { text-align:right; white-space:nowrap; }
.c-green { background:var(--green); } .c-yellow { background:var(--yellow); } .c-red { background:var(--red); color:var(--red-ink); }
.selected td { box-shadow: inset 0 3px 0 var(--header), inset 0 -3px 0 var(--header); }
.blink { animation: blink 1s steps(2, start) infinite; } @keyframes blink { to { background:#fff; } }
.detail { background:#fff; padding:16px 20px; border:1px solid var(--line); border-radius:8px; position:sticky; top:12px; }
.detail.placeholder { color:var(--muted); }
.detail h2 { margin:0 0 4px; } .status { display:inline-block; padding:2px 10px; border-radius:12px; font-weight:600; }
dl { display:grid; grid-template-columns:auto 1fr; gap:4px 12px; } dt { color:var(--muted); }
.steps { padding-left:22px; } .step { margin:6px 0; } .step.done { color:var(--muted); }
.step.done .name { text-decoration:line-through; } .step.active .name { font-weight:700; }
.actions { margin:6px 0 10px; }
form.people { display:flex; flex-wrap:wrap; gap:6px; margin:4px 0; }
button { font:inherit; border:0; border-radius:6px; padding:8px 12px; cursor:pointer; }
a.button { display:inline-block; text-decoration:none; font-weight:600; border-radius:6px; padding:8px 12px; }
button.primary, a.button.primary { background:var(--brand); color:#fff; } button.secondary, a.button.secondary { background:#e3f3e6; color:#14610a; }
button.danger { background:var(--red); color:var(--red-ink); } button.small, a.button.small { padding:4px 10px; font-size:15px; } a.button.small { white-space:nowrap; margin-top:4px; }
button.big { font-size:20px; padding:12px 20px; }
/* Zwijane sekcje: klikalna strzałka (obraca się po rozwinięciu). */
details.fold { margin:10px 0; } details.fold > summary { cursor:pointer; list-style:none; font-weight:700; padding:6px 0; user-select:none; }
details.fold > summary::-webkit-details-marker, .undo-toggle::-webkit-details-marker { display:none; }
details.fold > summary::before { content:''; display:inline-block; width:8px; height:8px; margin:0 10px 2px 4px; border:solid var(--brand); border-width:0 3px 3px 0; transform:rotate(-45deg); transition:transform .15s; }
details.fold[open] > summary::before { transform:rotate(45deg); }
details.fold > summary:hover { color:var(--brand); }
/* Przycisk „Cofnij ostatnie odhaczenie”: wyraźny, ale spokojny (czerwony obrys). */
.undo { margin:12px 0; } .undo-toggle { display:inline-block; border-radius:6px; font-weight:600; list-style:none; cursor:pointer; background:#fff; color:var(--red-ink); border:2px solid var(--red-ink); font-size:17px; padding:10px 16px; user-select:none; }
.undo-toggle:hover, .undo[open] > .undo-toggle { background:var(--red); } .undo[open] > form { margin-top:8px; }
/* Ustawienia: etykieta z podpowiedzią po lewej, pole po prawej. */
form.people > label.setting { display:grid; grid-template-columns:minmax(0,1fr) 190px; align-items:center; gap:2px 12px; padding:8px 0; border-bottom:1px solid var(--line); font-weight:600; }
.setting small { grid-column:1; font-weight:400; color:var(--muted); font-size:15px; }
.setting input { grid-column:2; grid-row:1 / span 2; }
.setting input[type=number] { font:inherit; padding:6px 8px; width:100%; border:1px solid var(--line); border-radius:6px; text-align:right; }
.setting input[type=date], .setting input.text { font:inherit; padding:6px 8px; width:100%; border:1px solid var(--line); border-radius:6px; }
.setting input[type=checkbox] { width:24px; height:24px; justify-self:end; accent-color:var(--brand); }
.history { list-style:none; padding:0; font-size:15px; color:var(--muted); } .history time { font-variant-numeric:tabular-nums; margin-right:6px; }
.error { background:var(--red); color:var(--red-ink); padding:10px 14px; border-radius:6px; }
.empty { background:#fff; padding:20px; }
.form-page { max-width:720px; background:#fff; padding:20px; border-radius:8px; }
.order-form label, form.inline label { display:block; margin:10px 0; font-weight:600; }
.order-form input, .order-form select, .order-form textarea, form.inline input { display:block; width:100%; font:inherit; padding:8px; margin-top:4px; border:1px solid var(--line); border-radius:6px; }
.offer-call label, form.people > label { flex-basis:100%; }
.offer-call textarea { display:block; width:100%; font:inherit; padding:6px; margin:4px 0; border:1px solid var(--line); border-radius:6px; }
.offer-call .choice { display:block; margin:4px 0; font-weight:600; } .page-actions { margin:0 0 12px; }
.people-list li { display:flex; gap:12px; align-items:center; margin:6px 0; } .people-list form { margin:0; }
`;

// Stałe napisane w kodzie (bez danych od użytkownika), więc wstawiamy je bez zamiany znaków.
const TRUSTED_STYLES = new SafeHtml(STYLES);
/** Skrypt strony; jedyna zmienna to liczba sekund (sprawdzona liczba całkowita z Ustawień). */
function trustedScript(refreshSeconds: number): SafeHtml {
  if (!Number.isInteger(refreshSeconds) || refreshSeconds <= 0)
    throw new Error('Nieprawidłowy czas odświeżania');
  return new SafeHtml(`var REFRESH_MS = ${refreshSeconds * MS_PER_SECOND};${PAGE_SCRIPT}`);
}
