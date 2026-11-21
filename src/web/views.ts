import { html, SafeHtml } from './html.js';
import { googleCalendarLink } from '../modules/calendar/google-calendar-link.js';
import {
  avatar,
  fold,
  formatDate,
  formatPrice,
  numberStepper,
  historyList,
  type HistoryUndo,
  personButtons,
  personTag,
  progressBar,
  rowClass,
  STATUS_ICON,
  statusChip,
} from './view-helpers.js';
import type { BoardRow } from '../modules/board/board-service.js';
import type { HistoryEntry, Order, OrderStep } from '../modules/orders/order-service.js';
import type { Person } from '../modules/people/people-repository.js';
import type { WorkType } from '../modules/work-types/work-type-repository.js';
import type { Colour, Urgency } from '../modules/urgency/urgency-rules.js';

/** Domyślnie co ile sekund odświeżać listy (zmienia się w Ustawieniach). */
const DEFAULT_REFRESH_SECONDS = 60;
const MS_PER_SECOND = 1000;
const COLOUR_LABEL = { green: 'w terminie', yellow: 'ostatni dzień', red: 'po terminie' } as const;

/** Ile spraw czeka w innych zakładkach (liczniki w menu i na kafelkach Tablicy). */
export interface NavCounts {
  /** Oferty na czerwono: trzeba zadzwonić do klienta. */
  offersToCall: number;
  /** Niezapłacone na czerwono: trzeba przypomnieć o zapłacie. */
  unpaidToRemind: number;
}
export const NO_COUNTS: NavCounts = { offersToCall: 0, unpaidToRemind: 0 };

/** Filtr „zlecenia bez daty pomiaru” (w adresie ?kolor=bez-daty, jak filtry kolorów). */
export const NO_DATE_FILTER = 'bez-daty';
/** Filtr Tablicy: kolor albo „bez daty pomiaru” (null = wszystkie). */
export type BoardFilter = Colour | typeof NO_DATE_FILTER | null;
const COLOURS: readonly Colour[] = ['red', 'yellow', 'green'];
const FILTERS: readonly NonNullable<BoardFilter>[] = [...COLOURS, NO_DATE_FILTER];

/** Odczyt filtra z adresu (?kolor=red, ?kolor=bez-daty); nieznana wartość = bez filtra. */
export function parseBoardFilter(value: string | undefined): BoardFilter {
  return FILTERS.find((f) => f === value) ?? null;
}

function matchesFilter(row: BoardRow, filter: BoardFilter): boolean {
  if (filter === null) return true;
  return filter === NO_DATE_FILTER ? row.measurementMissing : row.urgency.colour === filter;
}

export function layout(
  title: string,
  body: SafeHtml,
  refreshSeconds = DEFAULT_REFRESH_SECONDS,
  counts: NavCounts = NO_COUNTS,
  confirmActions = true,
): string {
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
        <div class="app">
          ${sideMenu(counts, refreshSeconds)}
          <main>${body}</main>
        </div>
        ${confirmDialog(confirmActions)}
        <script>
          ${trustedScript(refreshSeconds)};
        </script>
      </body>
    </html>`.value;
}

/**
 * Okienko „Czy na pewno?” na środku ekranu; skrypt strony wpisuje w nie, co ktoś kliknął.
 * data-all="1": pyta przy każdym kliknięciu osoby na karcie (Ustawienia); "0": tylko przy cofaniu kilku wpisów naraz.
 */
function confirmDialog(all: boolean): SafeHtml {
  return html`<dialog id="potwierdz" aria-labelledby="potwierdz-tytul" data-all="${all ? '1' : '0'}">
    <form method="dialog">
      <p class="ask-title" id="potwierdz-tytul">Czy na pewno?</p>
      <p class="ask-what" id="potwierdz-co"></p>
      <div class="ask-buttons">
        <button value="anuluj" class="secondary big" autofocus>Anuluj</button>
        <button value="tak" class="primary big">Tak, zapisz</button>
      </div>
    </form>
  </dialog>`;
}

/** Menu boczne: logo, żółty przycisk „+ Dodaj zlecenie”, zakładki z licznikami. */
function sideMenu(counts: NavCounts, refreshSeconds: number): SafeHtml {
  const link = (href: string, icon: string, label: string, badge = 0) =>
    html`<a href="${href}"
      ><span class="ic" aria-hidden="true">${icon}</span
      >${label}${badge > 0 ? html`<span class="badge" aria-hidden="true">${badge}</span>` : ''}</a
    >`;
  return html`<aside class="side">
    <div class="brand">
      <span class="logo" role="img" aria-label="Geodezja-ZGE"
        ><span class="logo-top">GEODEZJA</span><span class="logo-zge">ZGE</span></span
      ><span class="app-name">ZGE Menedżer</span>
    </div>
    <nav>
      <a class="add" href="/zlecenia/nowe">+ Dodaj zlecenie</a>
      ${link('/', '🗂', 'Tablica')} ${link('/oferty', '📨', 'Oferty', counts.offersToCall)}
      ${link('/niezaplacone', '💰', 'Niezapłacone', counts.unpaidToRemind)}
      ${link('/statystyki', '📊', 'Statystyki')} ${link('/ustawienia', '⚙', 'Ustawienia')}
    </nav>
    <a class="monitor-link" href="/monitor" target="_blank" rel="noopener"
      ><span class="ic" aria-hidden="true">📺</span>Widok na monitor</a
    >
    <p class="side-foot">Lista odświeża się co ${refreshSeconds} s</p>
  </aside>`;
}

export interface BoardOptions {
  counts: NavCounts;
  filter: BoardFilter;
  /** Filtr „Moje”: tylko zlecenia, w których bieżący krok należy do tej osoby (null = wszyscy). */
  person?: string | null;
  /** Osoby do wyboru w filtrze „Moje”. */
  people?: Person[];
}

/** Adres Tablicy z zachowaniem filtrów (kolor, osoba) i ewentualnie otwartym zleceniem. */
function boardUrl(params: { zlecenie?: number; kolor?: BoardFilter; osoba?: string | null }): string {
  const query = new URLSearchParams();
  if (params.zlecenie) query.set('zlecenie', String(params.zlecenie));
  if (params.kolor) query.set('kolor', params.kolor);
  if (params.osoba) query.set('osoba', params.osoba);
  const text = query.toString();
  return text ? `/?${text}` : '/';
}

const TILE_LABEL: Record<Colour, string> = {
  red: 'po terminie',
  yellow: 'ostatni dzień',
  green: 'w terminie',
};

export function boardPage(
  rows: BoardRow[],
  detail: SafeHtml | null,
  error: string | null,
  selectedId: number | null = null,
  options: BoardOptions = { counts: NO_COUNTS, filter: null },
): SafeHtml {
  const person = options.person ?? null;
  const { mine, shown } = filterRows(rows, options.filter, person);
  return html` ${error ? html`<p class="error" role="alert">${error}</p>` : ''}
    <div class="page-head"><h1>Tablica zleceń</h1></div>
    ${boardTiles(mine, options)}
    <div class="split">
      <section class="board" aria-label="Lista zleceń">
        <div class="toolbar">
          <input
            type="search"
            id="szukaj"
            placeholder="🔍 Szukaj klienta, miejscowości, działki…"
            aria-label="Szukaj"
            autocomplete="off"
          />
          ${personPicker(options.people ?? [], person)}
          ${
            options.filter
              ? html`<a class="filter" href="${boardUrl({ osoba: person })}"
                  >Pokaż wszystkie (${mine.length})</a
                >`
              : ''
          }
        </div>
        ${
          shown.length === 0
            ? html`<p class="empty">${emptyText(options.filter, person)}</p>`
            : boardTable(shown, selectedId, options.filter, person)
        }
        <p class="empty" id="brak-wynikow" hidden>Nic nie pasuje do wyszukiwania.</p>
      </section>
      ${detail ?? html`<section class="detail placeholder" aria-label="Szczegóły zlecenia"><p>Kliknij klienta na liście, żeby zobaczyć etap i co dalej.</p></section>`}
    </div>`;
}

/** Filtry Tablicy: najpierw osoba („Moje”, liczą się z tego kafelki), potem kolor. */
function filterRows(rows: BoardRow[], filter: BoardFilter, person: string | null) {
  const mine = person ? rows.filter((r) => r.owner === person) : rows;
  const shown = mine.filter((r) => matchesFilter(r, filter));
  return { mine, shown };
}

/** Napis przy pustej liście: zależy od wybranego filtra (kolor, osoba). */
function emptyText(filter: BoardFilter, person: string | null): string {
  if (filter === NO_DATE_FILTER) return 'Wszystkie zlecenia mają datę pomiaru.';
  if (filter) return 'Brak zleceń w tym kolorze.';
  if (person) return `${person} nie ma teraz żadnego kroku do zrobienia.`;
  return 'Brak aktywnych zleceń. Dodaj pierwsze przyciskiem „+ Dodaj zlecenie”.';
}

/**
 * Filtr „Moje”: wybór osoby. Program nie ma logowania, więc przeglądarka danego komputera
 * zapamiętuje wybraną osobę (skrypt w layout) i podpowiada przycisk „Moje”.
 */
function personPicker(people: Person[], person: string | null): SafeHtml {
  if (people.length === 0) return html``;
  return html`<a class="filter moje" id="moje" href="/" hidden>👤 Moje</a>
    <select id="osoba" aria-label="Pokaż zlecenia osoby">
      <option value="">👥 Wszyscy</option>
      ${people.map(
        (p) => html`<option value="${p.name}" ${p.name === person ? 'selected' : ''}>👤 ${p.name}</option>`,
      )}
    </select>`;
}

/** Kafelki na górze Tablicy: liczba zleceń w każdym kolorze (klik = filtr) oraz sprawy z innych zakładek. */
function boardTiles(rows: BoardRow[], options: BoardOptions): SafeHtml {
  const colourTile = (c: Colour) => {
    const count = rows.filter((r) => r.urgency.colour === c).length;
    return html`<a
      class="tile ${c}${options.filter === c ? ' on' : ''}"
      href="${boardUrl({ kolor: c, osoba: options.person ?? null })}"
      ><span class="ti" aria-hidden="true">${STATUS_ICON[c]}</span><b>${count}</b
      ><span>${TILE_LABEL[c]}</span></a
    >`;
  };
  const noDate = rows.filter((r) => r.measurementMissing).length;
  const noDateTile =
    noDate > 0
      ? html`<a
          class="tile no-date${options.filter === NO_DATE_FILTER ? ' on' : ''}"
          href="${boardUrl({ kolor: NO_DATE_FILTER, osoba: options.person ?? null })}"
          ><span class="ti" aria-hidden="true">📅</span><b>${noDate}</b><span>bez daty pomiaru</span></a
        >`
      : '';
  return html`<div class="tiles${noDate > 0 ? ' six' : ''}">
    ${COLOURS.map(colourTile)} ${noDateTile}
    <a class="tile offers" href="/oferty"
      ><span class="ti" aria-hidden="true">📞</span><b>${options.counts.offersToCall}</b
      ><span>oferty do telefonu</span></a
    >
    <a class="tile unpaid" href="/niezaplacone"
      ><span class="ti" aria-hidden="true">💰</span><b>${options.counts.unpaidToRemind}</b
      ><span>przypomnij o zapłacie</span></a
    >
  </div>`;
}

function boardTable(
  rows: BoardRow[],
  selectedId: number | null,
  filter: BoardFilter,
  person: string | null,
): SafeHtml {
  const link = (id: number) => boardUrl({ zlecenie: id, kolor: filter, osoba: person });
  return html`<table data-search-list>
    <thead>
      <tr>
        <th>Status</th>
        <th>Klient</th>
        <th>Miejscowość / działka</th>
        <th>Bieżący krok</th>
        <th class="num">Dni na kroku</th>
        <th>Ostatnio</th>
        <th class="num">Cena</th>
      </tr>
    </thead>
    <tbody>
      ${rows.map(
        (r) =>
          html`<tr
            class="${rowClass(r.urgency)}${r.orderId === selectedId ? ' selected' : ''}"
            onclick="location.href='${link(r.orderId)}'"
          >
            <td>${statusChip(r.urgency.colour, COLOUR_LABEL[r.urgency.colour])}</td>
            <td><a href="${link(r.orderId)}">${r.clientName}</a><small>${r.workTypeName}</small></td>
            <td>${r.town}${r.plot ? html`<small>dz. ${r.plot}</small>` : ''}</td>
            <td class="step-cell">
              ${r.currentStepName} ${progressBar(r.currentStepPosition, r.stepCount)}
              ${r.owner ? assigneeTag(r.owner) : ''} ${r.measurementMissing ? NO_DATE_LABEL : ''}
            </td>
            <td class="num">
              <b>${r.daysOnStep}</b
              >${r.urgency.daysOverdue > 0 ? html`<small class="late">${r.urgency.daysOverdue} po terminie</small>` : ''}
            </td>
            <td>${personTag(r.lastPerson)}</td>
            <td class="num">${formatPrice(r.pricePln)}</td>
          </tr>`,
      )}
    </tbody>
  </table>`;
}

/** Wyraźna etykieta przy zleceniu, które czeka na termin pomiaru. */
const NO_DATE_LABEL = html`<span class="missing-date"
  ><span aria-hidden="true">📅</span> Uzupełnij datę pomiaru</span
>`;

export function orderDetail(
  order: Order,
  workTypeName: string,
  urgency: Urgency | null,
  history: HistoryEntry[],
  people: Person[],
  /** Wpisy historii, do których można cofnąć zlecenie (najnowszy pierwszy). */
  undoableIds: number[] = [],
): SafeHtml {
  const activeStep = order.steps.find((st) => st.status === 'active');
  return html`<section class="detail card-${urgency?.colour ?? 'none'}" aria-label="Szczegóły zlecenia">
    <div class="detail-head">
      <h2>${order.clientName}</h2>
      ${orderStatus(order, urgency)}
    </div>
    ${activeStep ? progressBar(activeStep.position, order.steps.length) : ''}
    <dl class="facts">
      <dt>Telefon</dt>
      <dd><a href="tel:${order.phone}">${order.phone}</a></dd>
      <dt>Miejscowość</dt>
      <dd>${order.town}${order.plot ? html`, dz. ${order.plot}` : ''}</dd>
      <dt>Rodzaj pracy</dt>
      <dd>${workTypeName}</dd>
      <dt>Prowadzi</dt>
      <dd>${leadFact(order.leadPerson)}</dd>
      ${
        order.office
          ? html`<dt>Gmina / urząd</dt>
              <dd>${order.office}</dd>`
          : ''
      }
      <dt>Cena</dt>
      <dd>${formatPrice(order.pricePln)}</dd>
      ${measurementFact(order, workTypeName, people)}
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
    ${stepsSection(order, people, urgency)} ${assignForm(order, people)}
    ${historySection(history, orderUndo(order.id, undoableIds, people))}
  </section>`;
}

/** Etykieta stanu zlecenia: zakończone albo kolor bieżącego kroku (z liczbą dni po terminie). */
function orderStatus(order: Order, urgency: Urgency | null): SafeHtml {
  if (order.status === 'completed') return html`<span class="chip chip-done">Zlecenie zakończone</span>`;
  if (!urgency) return html``;
  const late = urgency.daysOverdue > 0 ? ` · ${urgency.daysOverdue} dni` : '';
  return statusChip(urgency.colour, `${COLOUR_LABEL[urgency.colour]}${late}`);
}

/**
 * Wiersz „Pomiar” na karcie: data (z przyciskiem kalendarza) albo wyraźne „Brak terminu”,
 * plus formularz wpisania / zmiany daty, dopóki zlecenie trwa.
 */
function measurementFact(order: Order, workTypeName: string, people: Person[]): SafeHtml {
  const hasMeasurementStep = order.steps.some((s) => s.kind === 'scheduled');
  if (!order.measurementOn && !hasMeasurementStep) return html``;
  const active = order.status === 'active';
  const shown = order.measurementOn
    ? html`${formatDate(order.measurementOn)} ${active ? calendarButton(order, workTypeName) : ''}`
    : html`<span class="missing-date"
        ><span aria-hidden="true">📅</span> Brak terminu: uzupełnij datę pomiaru</span
      >`;
  return html`<dt>Pomiar</dt>
    <dd>${shown} ${active ? measurementForm(order, people) : ''}</dd>`;
}

/** Wpisanie albo zmiana daty pomiaru (trafia do historii, da się cofnąć). */
function measurementForm(order: Order, people: Person[]): SafeHtml {
  const field = html`<input
    type="date"
    class="date-input"
    name="measurementOn"
    aria-label="Data pomiaru"
    required
    value="${order.measurementOn ?? ''}"
  />`;
  const buttons = personButtons(`/zlecenia/${order.id}/pomiar`, 'Zapisz datę', people, 'primary', field);
  if (!order.measurementOn) return html`<div class="measurement-form">${buttons}</div>`;
  return html`<details class="limit-change">
    <summary>Zmień datę pomiaru</summary>
    ${buttons}
  </details>`;
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

/** Zrobione kroki i kroki do zrobienia zwinięte pod strzałkami, bieżący krok zawsze widoczny (numery jak w rodzaju pracy). */
function stepsSection(order: Order, people: Person[], urgency: Urgency | null): SafeHtml {
  const done = order.steps.filter((s) => s.status === 'done');
  const current = order.steps.filter((s) => s.status === 'active');
  const todo = order.steps.filter((s) => s.status === 'pending');
  const list = (steps: OrderStep[]) =>
    html`<ol class="steps">
      ${steps.map((s) => stepItem(order, s, people, urgency))}
    </ol>`;
  return html`${done.length > 0 ? fold('steps-done', `Zrobione kroki (${done.length})`, list(done)) : ''}
  ${current.length > 0 ? list(current) : ''}
  ${todo.length > 0 ? fold('steps-todo', `Do zrobienia (${todo.length})`, list(todo)) : ''}
  ${done.length > 0 ? undoForm(order.id, people) : ''}`;
}

/** Cofanie wpisów historii zlecenia; `fields` = np. ukryte pole „wróć do Niezapłaconych”. */
export function orderUndo(
  orderId: number,
  undoableIds: number[],
  people: Person[],
  fields?: SafeHtml,
): HistoryUndo {
  return {
    entryId: undoableIds[0] ?? null,
    olderEntryIds: undoableIds.slice(1),
    olderAction: (id) => `/zlecenia/${orderId}/historia/${id}/cofnij-do`,
    action: (id) => `/zlecenia/${orderId}/historia/${id}/cofnij`,
    people,
    ...(fields ? { fields } : {}),
  };
}

/** Historia zlecenia (najnowsze na górze), zwijana; najnowszy działający wpis można cofnąć. Używana też w Niezapłaconych. */
export function historySection(history: HistoryEntry[], undo: HistoryUndo): SafeHtml {
  return fold('history', `Historia (${history.length})`, historyList(history, historyText, undo));
}

function stepItem(order: Order, step: OrderStep, people: Person[], urgency: Urgency | null): SafeHtml {
  const active = step.status === 'active';
  return html`<li value="${step.position}" class="step ${step.status}">
    ${active ? html`<span class="now-label">CO TERAZ · krok ${step.position} z ${order.steps.length}</span>` : ''}
    <span class="dot" aria-hidden="true">${step.status === 'done' ? '✓' : step.position}</span
    ><span class="name">${step.name}</span>${step.assignee ? assigneeTag(step.assignee) : ''}
    ${stepMeta(step, active ? urgency : null)}${active ? stepActions(order, step, people) : ''}
  </li>`;
}

/** Pod nazwą kroku: kto i kiedy zrobił albo limit (przy bieżącym kroku także ile dni po terminie). */
function stepMeta(step: OrderStep, urgency: Urgency | null): SafeHtml {
  if (step.status === 'done')
    return html`<small>zrobione ${formatDate(step.doneOn ?? '')}, ${step.doneBy}</small>`;
  const late =
    urgency && urgency.daysOverdue > 0
      ? html` · <b class="late">${urgency.daysOverdue} dni po terminie</b>`
      : '';
  const limit = step.limitDays
    ? `limit ${step.limitDays} dni rob.${step.provisional ? ' (do potwierdzenia)' : ''}`
    : '';
  return limit || late ? html`<small>${limit}${late}</small>` : html``;
}

/** Przyciski bieżącego kroku: kto zrobił / sprawdził, zmiana limitu. */
function stepActions(order: Order, step: OrderStep, people: Person[]): SafeHtml {
  const base = `/zlecenia/${order.id}/kroki/${step.position}`;
  const daily = step.kind === 'daily';
  return html`<div class="actions">
    <p class="who-asks">Kto zrobił? Kliknij swoje imię:</p>
    ${daily ? personButtons(`${base}/sprawdzone`, 'Sprawdzone dziś', people, 'secondary') : ''}
    ${personButtons(`${base}/zrobione`, daily ? 'Zakończone' : 'Zrobione', people, 'primary')}
    ${step.lastCheckedOn ? html`<small>ostatnio sprawdzone ${formatDate(step.lastCheckedOn)}, ${step.lastCheckedBy}</small>` : ''}
    ${step.limitDays !== null ? limitChangeForm(order.id, step, people) : ''}
  </div>`;
}

function leadFact(lead: string | null): SafeHtml {
  return lead ? assigneeTag(lead) : html`<small>nikt (ustaw w „Osoby w zleceniu”)</small>`;
}

/** Kółko i imię osoby, do której należy zlecenie lub krok. */
function assigneeTag(name: string): SafeHtml {
  return html`<span class="assignee">${avatar(name)} ${name}</span>`;
}

/**
 * „Osoby w zleceniu”: prowadzący i osoby kroków w jednym formularzu (można zaplanować z góry
 * i zmieniać w trakcie). Zrobionych kroków nie ma, krok bez osoby należy do prowadzącego.
 */
function assignForm(order: Order, people: Person[]): SafeHtml {
  if (order.status !== 'active') return html``;
  const open = order.steps.filter((st) => st.status !== 'done');
  const fields = html`<label class="setting"
      ><span>Prowadzi zlecenie</span
      >${personSelect('leadPerson', order.leadPerson, people, '— nikt —', 'Prowadzi zlecenie')}</label
    >
    ${open.map(
      (st) =>
        html`<label class="setting"
          ><span>${st.position}. ${st.name}</span
          >${personSelect(`step_${st.position}`, st.assignee, people, '— prowadzący —', `Osoba do kroku ${st.position}`)}</label
        >`,
    )}`;
  return html`<details class="assign">
    <summary>👥 Osoby w zleceniu (kto prowadzi, kto robi kroki)</summary>
    ${personButtons(`/zlecenia/${order.id}/osoby`, 'Zapisz osoby', people, 'secondary', fields)}
  </details>`;
}

/** Lista osób do wyboru; osoba usunięta z Ustawień, ale wciąż przypisana, zostaje na liście. */
function personSelect(
  name: string,
  current: string | null,
  people: Person[],
  emptyLabel: string,
  label: string,
): SafeHtml {
  const names = people.map((p) => p.name);
  if (current && !names.includes(current)) names.push(current);
  return html`<select name="${name}" aria-label="${label}">
    <option value="">${emptyLabel}</option>
    ${names.map((n) => html`<option value="${n}" ${n === current ? 'selected' : ''}>${n}</option>`)}
  </select>`;
}

/** Zmiana limitu tylko w tym zleceniu, np. gdy urząd zapowiedział dłuższy termin. */
function limitChangeForm(orderId: number, step: OrderStep, people: Person[]): SafeHtml {
  const field = html`<label class="setting"
    ><span>Nowy limit</span
    ><small>dni roboczych od rozpoczęcia kroku, tylko w tym zleceniu</small>${numberStepper(
      'Nowy limit',
      html`<input
        type="number"
        name="limitDays"
        min="1"
        max="365"
        step="1"
        value="${step.limitDays ?? ''}"
      />`,
    )}</label
  >`;
  return html`<details class="limit-change">
    <summary>Zmień limit tego kroku</summary>
    ${personButtons(`/zlecenia/${orderId}/kroki/${step.position}/limit`, 'Zmień limit', people, 'secondary', field)}
  </details>`;
}

function undoForm(orderId: number, people: Person[]): SafeHtml {
  return html`<details class="undo">
    <summary class="button undo-toggle">
      <span aria-hidden="true">↶</span> Cofnij ostatnie odhaczenie (pomyłka)
    </summary>
    ${personButtons(`/zlecenia/${orderId}/cofnij`, 'Cofnij', people, 'danger')}
  </details>`;
}

/** Co zrobiono, słowami (bez osoby); `step` = nazwa kroku w cudzysłowie, `note` = notatka w nawiasie. */
const HISTORY_WORDS: Record<HistoryEntry['action'], (step: SafeHtml, note: SafeHtml) => SafeHtml> = {
  created: () => html`przyjęcie zlecenia`,
  step_done: (step) => html`zrobione${step}`,
  checked: (step) => html`sprawdzone dziś${step}`,
  undone: (step, note) => html`cofnięcie${step}${note}`,
  payment_call: (_step, note) => html`przypomnienie o zapłacie${note}`,
  limit_changed: (step, note) => html`zmiana limitu${step}${note}`,
  lead_changed: (_step, note) => html`osoba prowadząca${note}`,
  step_assigned: (step, note) => html`osoba do kroku${step}${note}`,
  measurement_set: (_step, note) => html`data pomiaru${note}`,
};

export function historyText(h: HistoryEntry): SafeHtml {
  const step = h.stepName ? html` „${h.stepName}”` : html``;
  const note = h.note ? html` (${h.note})` : html``;
  return html`${h.person}: ${HISTORY_WORDS[h.action](step, note)}`;
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
      <label
        >Data pomiaru <small>(opcjonalnie: można uzupełnić później na karcie zlecenia)</small>
        <input type="date" name="measurementOn" value="${v('measurementOn')}"
      /></label>
      <label>Nr działki <small>(opcjonalnie)</small> <input name="plot" value="${v('plot')}" /></label>
      <label>Gmina / urząd <small>(opcjonalnie)</small> <input name="office" value="${v('office')}" /></label>
      <label
        >Cena w zł <small>(opcjonalnie)</small>
        <input name="pricePln" inputmode="decimal" value="${v('pricePln')}"
      /></label>
      <label>Notatka <small>(opcjonalnie)</small> <textarea name="note">${v('note')}</textarea></label>
      <label
        >Prowadzi zlecenie <small>(opcjonalnie; kroki można przypisać później na karcie)</small>
        <select name="leadPerson">
          <option value="">— nikt —</option>
          ${people.map(
            (p) =>
              html`<option value="${p.name}" ${v('leadPerson') === p.name ? 'selected' : ''}>
                ${p.name}
              </option>`,
          )}
        </select></label
      >
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
// Podświetlenie bieżącej zakładki w menu bocznym.
document.querySelectorAll('.side nav a:not(.add)').forEach(function (a) {
  var href = a.getAttribute('href');
  if (href === '/' ? location.pathname === '/' : location.pathname.indexOf(href) === 0) a.classList.add('on');
});
// Wyszukiwarka: ukrywa wiersze, w których nie ma wpisanego tekstu (bez wysyłania czegokolwiek).
var search = document.getElementById('szukaj');
if (search) search.addEventListener('input', function () {
  var q = search.value.trim().toLowerCase(), any = false;
  document.querySelectorAll('[data-search-list] tbody tr').forEach(function (tr) {
    var hit = tr.textContent.toLowerCase().indexOf(q) >= 0;
    tr.hidden = !hit; any = any || hit;
  });
  var none = document.getElementById('brak-wynikow');
  if (none) none.hidden = any || !document.querySelector('[data-search-list]');
});
// Filtr „Moje”: bez logowania. Wybrana osoba jest zapamiętana w tej przeglądarce (tylko na tym komputerze).
var picker = document.getElementById('osoba');
if (picker) {
  picker.addEventListener('change', function () {
    try { if (picker.value) localStorage.setItem('zge:ja', picker.value); } catch (e) {}
    location.href = picker.value ? '/?osoba=' + encodeURIComponent(picker.value) : '/';
  });
  var me = null;
  try { me = localStorage.getItem('zge:ja'); } catch (e) {}
  var mine = document.getElementById('moje');
  var known = me && Array.prototype.some.call(picker.options, function (o) { return o.value === me; });
  if (mine && known && picker.value !== me) {
    mine.href = '/?osoba=' + encodeURIComponent(me);
    mine.textContent = '👤 Moje (' + me + ')';
    mine.hidden = false;
  }
}
// Przyciski − / + przy polach liczbowych: zmiana o 1 w granicach min–max pola (puste pole: zaczyna od min).
document.querySelectorAll('.stepper [data-step]').forEach(function (b) {
  b.addEventListener('click', function () {
    var input = b.parentNode.querySelector('input');
    var min = parseInt(input.getAttribute('min') || '1', 10), max = parseInt(input.getAttribute('max') || '365', 10);
    var now = parseInt(input.value, 10);
    var next = isNaN(now) ? min : now + parseInt(b.getAttribute('data-step'), 10);
    input.value = String(Math.min(max, Math.max(min, next)));
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
});
// Okienko „Czy na pewno?”: kliknięcie osoby na karcie trzeba potwierdzić drugim kliknięciem „Tak, zapisz”.
var ask = document.getElementById('potwierdz');
var askAll = ask && ask.getAttribute('data-all') === '1';
if (ask) document.querySelectorAll(askAll ? '.detail form.people' : '.detail form.people[data-confirm]').forEach(function (form) {
  form.addEventListener('submit', function (e) {
    if (form.getAttribute('data-confirmed') === '1') return;
    e.preventDefault();
    var button = e.submitter;
    document.getElementById('potwierdz-co').textContent = button ? button.getAttribute('data-label') : '';
    ask.returnValue = '';
    ask.onclose = function () {
      if (ask.returnValue !== 'tak') return;
      form.setAttribute('data-confirmed', '1');
      form.requestSubmit(button);
    };
    ask.showModal();
  });
});
setInterval(function () {
  var busy = document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
  var openForm = document.querySelector('details[open]:not(.fold)');
  var searching = document.getElementById('szukaj') && document.getElementById('szukaj').value;
  var asking = document.querySelector('dialog[open]');
  if (!busy && !openForm && !searching && !asking && ['/', '/oferty', '/niezaplacone'].indexOf(location.pathname) >= 0) location.reload();
}, REFRESH_MS);`;

const STYLES = `
/* Styl C: ciemnozielone menu boczne (nawiązanie do ZGE), jasne karty, kolory pilności z ikonami. */
:root { --ink:#1f2937; --muted:#6b7280; --line:#e5e7eb; --bg:#f4f7f5; --card:#fff; --brand:#189400; --brand-dark:#15803d;
  --side:#0f3d24; --side-on:#1f6f43; --side-ink:#d1fae5; --add:#facc15; --select:#2563eb;
  --green:#dcfce7; --green-ink:#166534; --green-bar:#22c55e; --yellow:#fef3c7; --yellow-ink:#92400e; --yellow-bar:#f59e0b;
  --red:#fee2e2; --red-ink:#b91c1c; --red-bar:#dc2626; --shadow:0 1px 3px rgba(0,0,0,.08); }
* { box-sizing:border-box; }
body { margin:0; font:17px/1.4 "Segoe UI", Inter, system-ui, sans-serif; color:var(--ink); background:var(--bg); }
.app { display:grid; grid-template-columns:210px minmax(0,1fr); min-height:100vh; }
/* Menu boczne */
.side { background:var(--side); color:var(--side-ink); padding:16px 12px; display:flex; flex-direction:column; position:sticky; top:0; height:100vh; }
.brand { display:flex; align-items:center; gap:10px; color:#fff; margin:0 4px 20px; }
.logo { display:inline-grid; border:2px solid #fff; padding:2px 6px 4px; line-height:1; font-weight:700; letter-spacing:.04em; flex:none; }
.logo-top { font-size:11px; text-align:right; } .logo-zge { font-size:17px; border:2px solid #fff; padding:0 4px; justify-self:start; margin-top:3px; }
.app-name { font-size:16px; font-weight:700; line-height:1.2; }
.side nav { display:flex; flex-direction:column; gap:4px; }
.side nav a { display:flex; align-items:center; gap:10px; padding:11px 12px; border-radius:10px; color:var(--side-ink); text-decoration:none; font-weight:600; }
.side nav a:hover { background:#16512f; } .side nav a.on { background:var(--side-on); color:#fff; }
.side nav a.add { background:var(--add); color:var(--ink); justify-content:center; margin-bottom:12px; font-weight:700; box-shadow:0 4px 10px rgba(0,0,0,.2); }
.side nav a.add:hover { background:#fde047; }
.ic { width:22px; text-align:center; } .badge { margin-left:auto; background:#ef4444; color:#fff; border-radius:999px; font-size:13px; padding:1px 8px; font-weight:700; }
.side .monitor-link { margin-top:auto; display:flex; align-items:center; gap:10px; padding:9px 12px; border-radius:10px; color:var(--side-ink); text-decoration:none; font-size:15px; border:1px solid #1f6f43; }
.side .monitor-link:hover { background:#16512f; }
.side-foot { margin-top:8px; font-size:13px; color:#86efac; padding:0 6px; }
main { padding:18px 22px; min-width:0; }
.page-head h1, .form-page h2 { margin:0 0 14px; font-size:24px; }
/* Kafelki-liczniki */
.tiles { display:grid; grid-template-columns:repeat(5,minmax(0,1fr)); gap:12px; margin-bottom:14px; }
.tile { display:grid; grid-template-columns:auto 1fr; column-gap:12px; align-items:center; padding:12px 14px; border-radius:14px; background:var(--card); box-shadow:var(--shadow); color:var(--ink); text-decoration:none; border:2px solid transparent; }
.tile:hover { border-color:var(--line); } .tile.on { border-color:var(--ink); }
.tile .ti { grid-row:span 2; width:42px; height:42px; border-radius:12px; display:grid; place-items:center; font-size:21px; }
.tile b { font-size:26px; line-height:1; } .tile span:last-child { font-size:14px; color:var(--muted); font-weight:600; }
.tile.red .ti { background:var(--red); color:var(--red-bar); } .tile.yellow .ti { background:var(--yellow); color:#b45309; } .tile.green .ti { background:var(--green); color:var(--brand-dark); }
.tile.offers .ti { background:#dbeafe; } .tile.unpaid .ti { background:#f3e8ff; }
.tiles.six { grid-template-columns:repeat(6,minmax(0,1fr)); } .tile.no-date .ti { background:#ffedd5; }
.missing-date { display:inline-flex; align-items:center; gap:5px; margin-top:4px; padding:3px 10px; border-radius:999px; background:#ffedd5; color:#9a3412; border:1px solid #fdba74; font-weight:700; font-size:14px; }
.measurement-form { margin-top:8px; } .date-input { font:inherit; padding:8px 10px; border-radius:10px; border:1px solid #d1d5db; margin-bottom:8px; }
.toolbar { display:flex; gap:10px; align-items:center; margin-bottom:10px; }
.toolbar input[type=search] { flex:1; max-width:420px; font:inherit; padding:9px 14px; border-radius:10px; border:1px solid #d1d5db; background:#fff; }
.filter { padding:7px 14px; border-radius:999px; background:var(--ink); color:#fff; text-decoration:none; font-weight:600; font-size:15px; }
/* Lista + karta obok */
.split { display:grid; grid-template-columns:minmax(0,1fr) minmax(340px,30%); gap:16px; align-items:start; }
.board { min-width:0; padding-bottom:2px; }
table { width:100%; border-collapse:separate; border-spacing:0; background:var(--card); border-radius:14px; box-shadow:var(--shadow); }
.board { overflow-x:auto; } th:first-child { border-top-left-radius:14px; } th:last-child { border-top-right-radius:14px; }
th, td { padding:10px 12px; text-align:left; vertical-align:top; border-top:1px solid var(--line); }
th { border-top:0; font-size:12px; text-transform:uppercase; letter-spacing:.06em; color:var(--muted); font-weight:700; }
td small { display:block; color:var(--muted); font-size:13px; } td small.late { color:var(--red-ink); font-weight:600; }
tbody tr { cursor:pointer; } td a { color:inherit; font-weight:700; text-decoration:none; } tbody tr:hover td { filter:brightness(.98); }
td.num, th.num { text-align:right; } td.num { white-space:nowrap; } .step-cell { min-width:160px; }
/* Kolor wiersza: pasek z lewej + delikatne tło (czerwone/żółte), zielone bez tła. */
.c-red td { background:#fff5f5; } .c-yellow td { background:#fffbeb; }
.c-red td:first-child { box-shadow:inset 6px 0 var(--red-bar); } .c-yellow td:first-child { box-shadow:inset 6px 0 var(--yellow-bar); } .c-green td:first-child { box-shadow:inset 6px 0 var(--green-bar); }
.selected td { background:#eef6ff !important; box-shadow:inset 0 2px var(--select), inset 0 -2px var(--select); }
.selected td:first-child { box-shadow:inset 6px 0 var(--select), inset 0 2px var(--select), inset 0 -2px var(--select); }
.blink td { animation: blink 1s steps(2, start) infinite; } @keyframes blink { to { background:#fff; } }
/* Chipy statusu, kółka osób, pasek postępu */
.chip { display:inline-flex; align-items:center; gap:5px; padding:3px 11px; border-radius:999px; font-weight:700; font-size:14px; white-space:nowrap; }
.chip-red { background:var(--red); color:var(--red-ink); } .chip-yellow { background:var(--yellow); color:var(--yellow-ink); } .chip-green { background:var(--green); color:var(--green-ink); } .chip-done { background:#e5e7eb; color:var(--ink); }
.av { display:inline-grid; place-items:center; width:24px; height:24px; border-radius:50%; background:var(--p); color:#fff; font-size:12px; font-weight:700; flex:none; vertical-align:middle; }
.who { display:inline-flex; align-items:center; gap:6px; white-space:nowrap; }
.progress { display:flex; align-items:center; gap:8px; margin-top:4px; } .progress small { display:inline; margin:0; }
.bar { display:inline-block; width:70px; height:8px; border-radius:4px; background:var(--line); overflow:hidden; } .bar span { display:block; height:100%; background:var(--brand); }
/* Karta zlecenia */
.detail { background:var(--card); padding:18px 20px; border-radius:16px; box-shadow:var(--shadow); position:sticky; top:12px; }
.detail.placeholder { color:var(--muted); }
.detail-head { display:flex; justify-content:space-between; align-items:flex-start; gap:10px; } .detail h2 { margin:0 0 4px; font-size:23px; }
.detail h3 { font-size:14px; text-transform:uppercase; letter-spacing:.06em; color:var(--muted); margin:18px 0 8px; }
.status { display:inline-block; padding:3px 11px; border-radius:999px; font-weight:700; font-size:15px; }
.status.c-red { background:var(--red); color:var(--red-ink); } .status.c-yellow { background:var(--yellow); color:var(--yellow-ink); } .status.c-green { background:var(--green); color:var(--green-ink); } .status.done { background:#e5e7eb; }
dl { display:grid; grid-template-columns:auto 1fr; gap:6px 14px; } dt { color:var(--muted); } dd { margin:0; font-weight:600; } dd a { color:inherit; }
/* Kroki jako oś z numerkami; bieżący krok to wyróżniony blok „CO TERAZ”. */
.steps { list-style:none; padding:0; margin:0; }
.step { display:grid; grid-template-columns:28px 1fr; column-gap:10px; padding:4px 0; }
.step > small, .step > .actions, .step > .now-label { grid-column:2; } .step .dot { grid-row:span 2; width:24px; height:24px; border-radius:50%; display:grid; place-items:center; font-size:12px; font-weight:700; background:var(--line); }
.step.done { color:var(--muted); } .step.done .dot { background:var(--green); color:var(--green-ink); }
.step.active { background:#f0fdf4; border-left:6px solid var(--brand); border-radius:12px; padding:12px 12px 10px 8px; margin:6px 0; }
.card-red .step.active { background:#fef2f2; border-color:var(--red-bar); } .card-red .now-label { color:var(--red-ink); }
.card-yellow .step.active { background:#fffbeb; border-color:var(--yellow-bar); } .card-yellow .now-label { color:var(--yellow-ink); }
.step.active .dot { background:var(--brand); color:#fff; } .step.active .name { font-weight:700; font-size:19px; }
.now-label { font-size:12px; font-weight:800; letter-spacing:.08em; color:var(--brand-dark); }
.step.active .late, .late { color:var(--red-ink); }
.who-asks { margin:8px 0 4px; font-size:15px; font-weight:600; }
.actions { margin:2px 0 4px; }
form.people { display:flex; flex-wrap:wrap; gap:8px; margin:4px 0; }
/* Przyciski */
button { font:inherit; border:0; border-radius:10px; padding:8px 14px; cursor:pointer; }
a.button { display:inline-block; text-decoration:none; font-weight:600; border-radius:10px; padding:9px 14px; }
button.primary, a.button.primary { background:var(--brand); color:#fff; font-weight:600; } button.secondary, a.button.secondary { background:var(--green); color:var(--green-ink); font-weight:600; }
button.danger { background:var(--red); color:var(--red-ink); } button.small, a.button.small { padding:4px 10px; font-size:15px; } a.button.small { margin-top:4px; }
button.big { font-size:20px; padding:12px 22px; }
/* Przycisk osoby: kółko z literą + obwódka w kolorze tej osoby. */
button.person { display:inline-flex; align-items:center; gap:8px; padding:6px 14px 6px 6px; border-radius:999px; background:#fff; color:var(--ink); border:2px solid var(--p); font-weight:600; }
button.person:hover { background:var(--p); color:#fff; } button.person.danger { color:var(--red-ink); }
button:disabled { opacity:.35; cursor:default; }
/* Zwijane sekcje: klikalna strzałka (obraca się po rozwinięciu). */
details.fold { margin:10px 0; } details.fold > summary { cursor:pointer; list-style:none; font-weight:700; padding:6px 0; user-select:none; }
details.fold > summary::-webkit-details-marker, .undo-toggle::-webkit-details-marker { display:none; }
details.fold > summary::before { content:''; display:inline-block; width:8px; height:8px; margin:0 10px 2px 4px; border:solid var(--brand); border-width:0 3px 3px 0; transform:rotate(-45deg); transition:transform .15s; }
details.fold[open] > summary::before { transform:rotate(45deg); }
details.fold > summary:hover { color:var(--brand); }
/* Przycisk „Cofnij ostatnie odhaczenie”: wyraźny, ale spokojny (czerwony obrys). */
.undo { margin:12px 0; } .undo-toggle { display:inline-block; border-radius:10px; font-weight:600; list-style:none; cursor:pointer; background:#fff; color:var(--red-ink); border:2px solid var(--red-ink); font-size:16px; padding:9px 16px; user-select:none; }
.undo-toggle:hover, .undo[open] > .undo-toggle { background:var(--red); } .undo[open] > form { margin-top:8px; }
/* Ustawienia: etykieta z podpowiedzią po lewej, pole po prawej. */
.settings-nav { display:flex; flex-wrap:wrap; gap:8px; margin:0 0 6px; } .settings-nav a { padding:7px 14px; border-radius:999px; background:var(--green); color:var(--green-ink); text-decoration:none; font-weight:600; font-size:15px; }
.form-page h3 { font-size:19px; margin:26px 0 6px; padding-top:14px; border-top:1px solid var(--line); scroll-margin-top:12px; }
form.people > label.setting { display:grid; grid-template-columns:minmax(0,1fr) 190px; align-items:center; gap:2px 12px; padding:10px 0; border-bottom:1px solid var(--line); font-weight:600; }
.setting small { grid-column:1; font-weight:400; color:var(--muted); font-size:15px; }
.setting input { grid-column:2; grid-row:1 / span 2; }
.assignee { display:inline-flex; align-items:center; gap:4px; margin-left:8px; font-size:14px; font-weight:600; color:var(--muted); white-space:nowrap; }
td .assignee { display:flex; margin:4px 0 0; }
.assign { margin-top:12px; } .assign > summary { cursor:pointer; font-weight:600; color:var(--brand-dark); }
.setting select { grid-column:2; grid-row:1 / span 2; font:inherit; padding:6px 8px; border:1px solid #d1d5db; border-radius:10px; width:100%; }
#osoba { font:inherit; padding:7px 10px; border:1px solid #d1d5db; border-radius:10px; background:#fff; }
.setting .stepper { grid-column:2; grid-row:1 / span 2; }
.stepper { display:flex; align-items:stretch; gap:4px; }
.stepper input { min-width:0; flex:1; } .stepper .minus { order:-1; }
.step-btn { flex:none; width:40px; padding:0; border:1px solid #d1d5db; border-radius:10px; background:#fff; font-size:22px; font-weight:700; line-height:1; color:var(--ink); }
.step-btn:hover { background:var(--green); border-color:var(--brand); }
.setting input[type=number] { font:inherit; padding:7px 10px; width:100%; border:1px solid #d1d5db; border-radius:10px; text-align:right; }
.setting input[type=date], .setting input.text { font:inherit; padding:7px 10px; width:100%; border:1px solid #d1d5db; border-radius:10px; }
.setting input[type=checkbox] { width:24px; height:24px; justify-self:end; accent-color:var(--brand); }
/* Edytor rodzaju pracy. */
.form-page.wide { max-width:1100px; }
.default-submit { position:absolute; left:-9999px; width:1px; height:1px; overflow:hidden; }
.wt-name { display:block; font-weight:600; margin:10px 0; } .wt-name input { display:block; width:100%; font:inherit; padding:8px; margin-top:4px; border:1px solid #d1d5db; border-radius:10px; }
.steps-editor { box-shadow:none; } .steps-editor input, .steps-editor select { font:inherit; padding:6px; border:1px solid #d1d5db; border-radius:8px; width:100%; }
.steps-editor input.limit { width:64px; text-align:right; border:1px solid #d1d5db; border-radius:10px; padding:6px 8px; font:inherit; } .steps-editor .step-btn { width:34px; } .steps-editor select { width:auto; } .steps-editor td { vertical-align:middle; padding:6px 8px; background:#fff !important; } .steps-editor .center { text-align:center; }
.steps-editor input[type=radio] { width:22px; height:22px; accent-color:var(--brand); }
.steps-editor tbody tr { cursor:default; }
.order-buttons { white-space:nowrap; } .order-buttons button { background:#eef0f3; margin-right:2px; } .order-buttons button.danger { background:var(--red); }
.hints { color:var(--muted); font-size:15px; } .notice { background:var(--green); color:var(--green-ink); padding:10px 14px; border-radius:10px; } .notice.warn { background:var(--yellow); color:var(--yellow-ink); }
.work-types li { margin:6px 0; } .work-types a { font-weight:700; color:var(--ink); } .hidden-mark { color:var(--red-ink); }
div.people { display:flex; flex-wrap:wrap; gap:6px; margin:8px 0; }
.limit-change > summary { cursor:pointer; color:var(--muted); font-size:15px; margin-top:8px; }
/* Zmiana limitu w karcie zlecenia: karta jest wąska, więc opis na górze, a − / pole / + w osobnym wierszu pod nim. */
.limit-change form.people > label.setting { grid-template-columns:minmax(0,1fr); }
.limit-change .setting small, .limit-change .setting .stepper { grid-column:1; grid-row:auto; }
.limit-change .setting .stepper { max-width:240px; margin-top:6px; }
.history { list-style:none; padding:0; font-size:15px; color:var(--muted); } .history li { display:flex; gap:8px; align-items:center; margin:3px 0; }
.history time { font-variant-numeric:tabular-nums; white-space:nowrap; } .history li { align-items:flex-start; } .history .av { flex:none; }
.history li.reverted { opacity:.6; } .history li.reverted s { display:flex; gap:8px; align-items:flex-start; }
.history li.can-undo { display:block; } .undo-entry > summary { list-style:none; display:flex; gap:8px; align-items:center; flex-wrap:wrap; cursor:pointer; padding:4px 8px; margin:0 -8px; border-radius:8px; border:1px dashed var(--red-ink); color:var(--ink); }
.undo-entry > summary::-webkit-details-marker { display:none; } .undo-entry > summary:hover, .undo-entry[open] > summary { background:var(--red); }
.undo-hint { margin-left:auto; color:var(--red-ink); font-weight:700; font-size:13px; white-space:nowrap; } .undo-entry[open] { padding-bottom:6px; }
/* Starsze wpisy („cofnij do tego miejsca”): spokojniejsze, ramka dopiero po najechaniu. */
.back-to .undo-entry > summary { border-color:transparent; } .back-to .undo-entry > summary:hover, .back-to .undo-entry[open] > summary { border-color:var(--red-ink); }
.back-to .undo-hint { font-weight:600; opacity:.7; }
.recent-head { font-size:17px; margin:22px 0 6px; } .recent { list-style:none; padding:0; margin:0; background:var(--card); border-radius:14px; box-shadow:var(--shadow); }
.recent li { display:flex; gap:10px; align-items:baseline; padding:8px 12px; border-top:1px solid var(--line); } .recent li:first-child { border-top:0; }
.recent li span { color:var(--muted); } .recent li small { margin-left:auto; color:var(--muted); } .hint { color:var(--muted); font-size:14px; }
.error { background:var(--red); color:var(--red-ink); padding:10px 14px; border-radius:10px; }
.empty { background:#fff; padding:20px; border-radius:14px; box-shadow:var(--shadow); }
.form-page { max-width:760px; background:#fff; padding:22px 24px; border-radius:16px; box-shadow:var(--shadow); }
.order-form label, form.inline label { display:block; margin:10px 0; font-weight:600; }
.order-form input, .order-form select, .order-form textarea, form.inline input { display:block; width:100%; font:inherit; padding:9px 10px; margin-top:4px; border:1px solid #d1d5db; border-radius:10px; }
/* Oferty i Niezapłacone: blok rozmowy wyróżniony jak „CO TERAZ”. */
.offer-call { background:#eff6ff; border-left:6px solid var(--select); border-radius:12px; padding:12px 14px; margin:6px 0 12px; }
.offer-call label, form.people > label { flex-basis:100%; }
.offer-call textarea { display:block; width:100%; font:inherit; padding:8px; margin:4px 0; border:1px solid #bfdbfe; border-radius:10px; }
.offer-call .choice { display:block; margin:4px 0; font-weight:600; } .page-actions { margin:0 0 12px; }
.page-head { display:flex; justify-content:space-between; align-items:center; gap:12px; } .page-head .page-actions { margin:0 0 14px; }
.summary { display:flex; gap:32px; background:#fff; border-radius:14px; box-shadow:var(--shadow); padding:12px 18px; margin-bottom:14px; }
.summary span { color:var(--muted); font-size:15px; } .summary b { display:block; font-size:24px; } .summary b.late { color:var(--red-ink); }
.people-list li { display:flex; gap:12px; align-items:center; margin:6px 0; } .people-list form { margin:0; }
/* Okienko „Czy na pewno?” */
dialog#potwierdz { border:0; border-radius:18px; padding:26px 30px; box-shadow:0 20px 60px rgba(0,0,0,.35); text-align:center; min-width:380px; }
dialog#potwierdz::backdrop { background:rgba(15,61,36,.55); }
.ask-title { font-size:24px; font-weight:800; margin:0 0 8px; } .ask-what { font-size:20px; font-weight:600; margin:0 0 20px; color:var(--brand-dark); }
.ask-buttons { display:flex; gap:12px; justify-content:center; }
/* Mniejszy ekran laptopa: w tabeli sama ikona statusu (słowo zostaje dla czytników ekranu), węższe odstępy. */
.detail-head { flex-wrap:wrap; }
@media (max-width:1500px) {
  td .chip-label { position:absolute; width:1px; height:1px; overflow:hidden; clip:rect(0 0 0 0); }
  td .chip { padding:4px 8px; font-size:16px; } th, td { padding:9px 8px; }
  td .who-name { position:absolute; width:1px; height:1px; overflow:hidden; clip:rect(0 0 0 0); }
  .split { grid-template-columns:minmax(0,1fr) minmax(320px,29%); }
}
/* Jeszcze mniejszy ekran: kafelki w 3 kolumnach, karta zlecenia pod listą. */
.page-sub { margin:2px 0 0; color:var(--muted); } .section-head { font-size:19px; margin:24px 0 10px; }
.stats { display:grid; grid-template-columns:repeat(6,minmax(0,1fr)); gap:12px; }
.stat { display:grid; grid-template-columns:auto 1fr; column-gap:12px; align-items:center; padding:14px; border-radius:14px; background:var(--card); box-shadow:var(--shadow); }
.stat .ti { grid-row:span 2; width:44px; height:44px; border-radius:12px; display:grid; place-items:center; font-size:22px; }
.stat b { font-size:24px; line-height:1.1; white-space:nowrap; } .stat span:last-child { font-size:14px; color:var(--muted); font-weight:600; }
.stat.clients .ti { background:#dbeafe; } .stat.new .ti { background:#fae8ff; } .stat.income .ti, .stat.total .ti { background:var(--green); }
.stat.income b, .stat.total b { color:var(--brand-dark); } .stat.unpaid .ti { background:var(--yellow); } .stat.progress .ti { background:#e0e7ff; }
.months td.income { min-width:260px; } .income-bar { display:inline-block; vertical-align:middle; width:150px; height:12px; border-radius:6px; background:var(--line); overflow:hidden; margin-right:10px; }
.income-bar span { display:block; height:100%; background:linear-gradient(90deg,#4ade80,var(--brand)); border-radius:6px; }
.how { margin:20px 0; color:var(--muted); } .how summary { cursor:pointer; font-weight:600; color:var(--ink); }
@media (max-width:1280px) { .tiles, .tiles.six { grid-template-columns:repeat(3,minmax(0,1fr)); } .stats { grid-template-columns:repeat(3,minmax(0,1fr)); } }
@media (max-width:1100px) { .split { grid-template-columns:1fr; } .detail { position:static; } }
`;

// Stałe napisane w kodzie (bez danych od użytkownika), więc wstawiamy je bez zamiany znaków.
const TRUSTED_STYLES = new SafeHtml(STYLES);
/** Skrypt strony; jedyna zmienna to liczba sekund (sprawdzona liczba całkowita z Ustawień). */
function trustedScript(refreshSeconds: number): SafeHtml {
  return new SafeHtml(`var REFRESH_MS = ${refreshMs(refreshSeconds)};${PAGE_SCRIPT}`);
}

/** Sekundy z Ustawień → milisekundy dla skryptu; tylko dodatnia liczba całkowita trafia do strony. */
export function refreshMs(refreshSeconds: number): number {
  if (!Number.isInteger(refreshSeconds) || refreshSeconds <= 0)
    throw new Error('Nieprawidłowy czas odświeżania');
  return refreshSeconds * MS_PER_SECOND;
}
