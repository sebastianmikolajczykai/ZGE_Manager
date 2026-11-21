import { html, type SafeHtml } from './html.js';
import {
  fold,
  formatDate,
  formatPrice,
  historyList,
  personButtons,
  personTag,
  rowClass,
  statusChip,
} from './view-helpers.js';
import type {
  ClosedOfferRow,
  Offer,
  OfferHistoryEntry,
  OfferRow,
  OfferStatus,
} from '../modules/offers/offer-service.js';
import type { Person } from '../modules/people/people-repository.js';
import type { WorkType } from '../modules/work-types/work-type-repository.js';
import type { Urgency } from '../modules/urgency/urgency-rules.js';

const OFFER_COLOUR_LABEL = {
  green: 'w terminie',
  yellow: 'jutro zadzwoń',
  red: 'zadzwoń do klienta',
} as const;
const CLOSED_LABEL: Record<Exclude<OfferStatus, 'open'>, string> = {
  accepted: 'Oferta przyjęta',
  rejected: 'Oferta odrzucona',
  closed: 'Kontakt zakończony',
};

/** Zakładka Oferty: lista otwartych ofert po lewej, karta wybranej oferty po prawej. */
export function offersPage(
  rows: OfferRow[],
  detail: SafeHtml | null,
  error: string | null,
  selectedId: number | null = null,
  recentlyClosed: ClosedOfferRow[] = [],
): SafeHtml {
  return html` ${error ? html`<p class="error" role="alert">${error}</p>` : ''}
    <div class="page-head">
      <h1>Oferty</h1>
      <p class="page-actions"><a class="button primary" href="/oferty/nowa">+ Dodaj ofertę</a></p>
    </div>
    <div class="split">
      <section class="board" aria-label="Lista ofert">
        ${rows.length === 0 ? html`<p class="empty">Brak otwartych ofert.</p>` : offersTable(rows, selectedId)}
        ${recentlyClosed.length > 0 ? closedList(recentlyClosed) : ''}
      </section>
      ${detail ?? html`<section class="detail placeholder" aria-label="Szczegóły oferty"><p>Kliknij klienta na liście, żeby zobaczyć ofertę.</p></section>`}
    </div>`;
}

/** Ostatnio zamknięte oferty: link do karty, gdzie w historii można cofnąć zamknięcie. */
function closedList(closed: ClosedOfferRow[]): SafeHtml {
  return html`<h2 class="recent-head">Ostatnio zamknięte</h2>
    <ul class="recent">
      ${closed.map(
        (o) =>
          html`<li>
            <a href="/oferty?oferta=${o.offerId}">${o.clientName}</a> <span>${CLOSED_LABEL[o.status]}</span>
            <small>${formatDate(o.closedOn)}</small>
          </li>`,
      )}
    </ul>
    <p class="hint">Pomyłka? Otwórz ofertę i w Historii kliknij wpis, żeby go cofnąć.</p>`;
}

function offersTable(rows: OfferRow[], selectedId: number | null): SafeHtml {
  return html`<table>
    <thead>
      <tr>
        <th>Status</th>
        <th>Klient</th>
        <th>Miejscowość</th>
        <th class="num">Cena</th>
        <th>Wysłana</th>
        <th class="num">Dni od kontaktu</th>
        <th>Kto</th>
      </tr>
    </thead>
    <tbody>
      ${rows.map(
        (r) =>
          html`<tr
            class="${rowClass(r.urgency)}${r.offerId === selectedId ? ' selected' : ''}"
            onclick="location.href='/oferty?oferta=${r.offerId}'"
          >
            <td>${statusChip(r.urgency.colour, OFFER_COLOUR_LABEL[r.urgency.colour])}</td>
            <td><a href="/oferty?oferta=${r.offerId}">${r.clientName}</a><small>${r.workTypeName}</small></td>
            <td>${r.town ?? '–'}</td>
            <td class="num">${formatPrice(r.pricePln)}</td>
            <td>${formatDate(r.sentOn)}</td>
            <td class="num"><b>${r.daysSinceContact}</b></td>
            <td>${personTag(r.lastPerson)}</td>
          </tr>`,
      )}
    </tbody>
  </table>`;
}

export function offerDetail(
  offer: Offer,
  workTypeName: string,
  urgency: Urgency,
  history: OfferHistoryEntry[],
  people: Person[],
  reminderDays: number,
  undoableId: number | null = null,
): SafeHtml {
  const open = offer.status === 'open';
  return html`<section class="detail" aria-label="Szczegóły oferty">
    <div class="detail-head">
      <h2>${offer.clientName}</h2>
      ${
        open
          ? statusChip(urgency.colour, OFFER_COLOUR_LABEL[urgency.colour])
          : html`<span class="chip chip-done"
              >${CLOSED_LABEL[offer.status as Exclude<OfferStatus, 'open'>]}</span
            >`
      }
    </div>
    <dl>
      <dt>Telefon</dt>
      <dd><a href="tel:${offer.phone}">${offer.phone}</a></dd>
      <dt>Rodzaj pracy</dt>
      <dd>${workTypeName}</dd>
      ${
        offer.town
          ? html`<dt>Miejscowość</dt>
              <dd>${offer.town}${offer.plot ? html`, dz. ${offer.plot}` : ''}</dd>`
          : ''
      }
      <dt>Cena</dt>
      <dd>${formatPrice(offer.pricePln)}</dd>
      <dt>Wysłana</dt>
      <dd>${formatDate(offer.sentOn)}, ${offer.sentBy}</dd>
      <dt>Ostatni kontakt</dt>
      <dd>${formatDate(offer.lastContactOn)}</dd>
      ${
        offer.note
          ? html`<dt>Notatka</dt>
              <dd>${offer.note}</dd>`
          : ''
      }
      ${
        offer.orderId
          ? html`<dt>Zlecenie</dt>
              <dd><a href="/?zlecenie=${offer.orderId}">nr ${offer.orderId}</a></dd>`
          : ''
      }
    </dl>
    ${open ? offerActions(offer, people, reminderDays) : ''}
    ${fold(
      'history',
      `Historia (${history.length})`,
      historyList(history, historyText, {
        entryId: undoableId,
        action: (id) => `/oferty/${offer.id}/historia/${id}/cofnij`,
        people,
      }),
    )}
  </section>`;
}

function offerActions(offer: Offer, people: Person[], reminderDays: number): SafeHtml {
  const callFields = html`<label
      >Notatka z rozmowy <small>(opcjonalnie)</small><textarea name="note"></textarea>
    </label>
    <label class="choice"
      ><input type="radio" name="next" value="again" checked /> Przypomnij znów za ${reminderDays} dni
      roboczych</label
    >
    <label class="choice"><input type="radio" name="next" value="end" /> Kontakt zakończony</label>`;
  return html`<div class="offer-call">
      <p class="now-label">CO TERAZ · 📞 TELEFON DO KLIENTA</p>
      ${personButtons(`/oferty/${offer.id}/telefon`, 'Rozmowa', people, 'primary', callFields)}
    </div>
    <p><a class="button secondary" href="/zlecenia/nowe?oferta=${offer.id}">Przyjęta → zrób zlecenie</a></p>
    <details class="reject">
      <summary>Odrzucona</summary>
      ${personButtons(
        `/oferty/${offer.id}/odrzucona`,
        'Odrzucona',
        people,
        'danger',
        html`<label>Powód <small>(opcjonalnie)</small><input name="reason" /></label>`,
      )}
    </details>`;
}

function historyText(h: OfferHistoryEntry): SafeHtml {
  const note = h.note ? html` (${h.note})` : '';
  switch (h.action) {
    case 'created':
      return html`${h.person}: wysłanie oferty${note}`;
    case 'called':
      return html`${h.person}: telefon${note}`;
    case 'contact_ended':
      return html`${h.person}: kontakt zakończony${note}`;
    case 'rejected':
      return html`${h.person}: odrzucona${note}`;
    case 'accepted':
      return html`${h.person}: przyjęta${note}`;
    case 'undone':
      return html`${h.person}: cofnięcie${note}`;
  }
}

export function offerForm(
  workTypes: WorkType[],
  people: Person[],
  values: Record<string, string>,
  error: string | null,
): SafeHtml {
  const v = (name: string) => values[name] ?? '';
  return html`<section class="form-page">
    <h2>Nowa oferta</h2>
    ${error ? html`<p class="error" role="alert">${error}</p>` : ''}
    <form method="post" action="/oferty" class="order-form">
      <label>Klient <input name="clientName" required value="${v('clientName')}" /></label>
      <label>Telefon <input name="phone" required inputmode="tel" value="${v('phone')}" /></label>
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
      <label>Data wysłania <input type="date" name="sentOn" required value="${v('sentOn')}" /></label>
      <label>Miejscowość <small>(opcjonalnie)</small> <input name="town" value="${v('town')}" /></label>
      <label>Nr działki <small>(opcjonalnie)</small> <input name="plot" value="${v('plot')}" /></label>
      <label
        >Cena w zł <small>(opcjonalnie)</small>
        <input name="pricePln" inputmode="decimal" value="${v('pricePln')}"
      /></label>
      <label>Notatka <small>(opcjonalnie)</small> <textarea name="note">${v('note')}</textarea></label>
      <label
        >Kto wysłał
        <select name="person">
          ${people.map((p) => html`<option ${v('person') === p.name ? 'selected' : ''}>${p.name}</option>`)}
        </select></label
      >
      <button class="primary big">Zapisz ofertę</button>
    </form>
  </section>`;
}
