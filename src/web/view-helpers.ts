import { html, type SafeHtml } from './html.js';
import type { Person } from '../modules/people/people-repository.js';
import type { Colour, Urgency } from '../modules/urgency/urgency-rules.js';

/** Drobne elementy wspólne dla ekranów zleceń i ofert. */

/** Przyciski „{etykieta}: {osoba}” w jednym formularzu; `fields` = dodatkowe pola (np. notatka). */
export function personButtons(
  action: string,
  label: string,
  people: Person[],
  style: string,
  fields: SafeHtml | null = null,
  alwaysConfirm = false,
): SafeHtml {
  if (people.length === 0) return html`<p class="error">Dodaj osoby w Ustawieniach.</p>`;
  // data-confirm: okienko „Czy na pewno?” nawet wtedy, gdy w Ustawieniach jest wyłączone.
  const confirm = alwaysConfirm ? html` data-confirm="1"` : '';
  return html`<form method="post" action="${action}" class="people" ${confirm}>
    ${fields} ${personButtonList(label, people, style)}
  </form>`;
}

/** Same przyciski „{etykieta}: {osoba}” (wysyłają pole person); do wstawienia we własny formularz. */
export function personButtonList(label: string, people: Person[], style: string): SafeHtml {
  return html`${people.map(
    (p) =>
      html`<button
        class="${style} person"
        style="--p:${personColour(p.name)}"
        name="person"
        value="${p.name}"
        data-label="${label}: ${p.name}"
      >
        ${avatar(p.name)} ${label}: ${p.name}
      </button>`,
  )}`;
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

/**
 * Sekcja zwijana strzałką (np. zrobione kroki, historia). Domyślnie zwinięta;
 * przeglądarka pamięta, czy była rozwinięta (skrypt w layout, po atrybucie data-fold).
 */
export function fold(name: string, title: string, content: SafeHtml): SafeHtml {
  return html`<details class="fold" data-fold="${name}">
    <summary>${title}</summary>
    ${content}
  </details>`;
}

/** Kolory osób (kółko z pierwszą literą imienia). Każde imię zawsze dostaje ten sam kolor. */
const PERSON_COLOURS = ['#2563eb', '#ea580c', '#9333ea', '#0d9488', '#db2777', '#65a30d'] as const;
const PERCENT = 100;

export function personColour(name: string): string {
  const sum = [...name].reduce((total, ch) => total + (ch.codePointAt(0) ?? 0), 0);
  return PERSON_COLOURS[sum % PERSON_COLOURS.length] as string;
}

/** Kolorowe kółko z pierwszą literą imienia; tylko ozdoba (czytniki ekranu czytają samo imię obok). */
export function avatar(name: string): SafeHtml {
  return html`<span class="av" style="--p:${personColour(name)}" aria-hidden="true"
    >${[...name][0] ?? '?'}</span
  >`;
}

/** Kółko osoby z imieniem albo kreska, gdy nikt jeszcze nic nie zrobił. */
export function personTag(name: string | null): SafeHtml {
  return name
    ? html`<span class="who" title="${name}">${avatar(name)} <span class="who-name">${name}</span></span>`
    : html`–`;
}

/** Ikona przy kolorze: pilność widać także na słabym monitorze i przy zaburzeniach widzenia barw. */
export const STATUS_ICON: Record<Colour, string> = { red: '⚠', yellow: '⏰', green: '✓' };

/** Kolorowa etykieta statusu: kolor + ikona + słowo. */
export function statusChip(colour: Colour, label: string): SafeHtml {
  return html`<span class="chip chip-${colour}"
    ><span aria-hidden="true">${STATUS_ICON[colour]}</span> <span class="chip-label">${label}</span></span
  >`;
}
/** Pasek postępu „krok 3/13”. */
export function progressBar(position: number, total: number): SafeHtml {
  const percent = total > 0 ? Math.round((position / total) * PERCENT) : 0;
  return html`<span class="progress"
    ><span class="bar"><span style="width:${percent}%"></span></span
    ><small>krok ${position}/${total}</small></span
  >`;
}

/**
 * Przyciski − / + przy polu liczbowym (zmiana o 1 jednym kliknięciem). Nie wysyłają formularza:
 * zmieniają tylko liczbę w polu (skrypt w layout, po atrybucie data-step), zapis dalej przyciskiem „Zapisz”.
 */
export function numberStepper(label: string, input: SafeHtml): SafeHtml {
  // Pole jest pierwsze w kodzie (etykieta <label> wskazuje pierwsze pole w środku); „−” stoi po lewej dzięki CSS (order).
  return html`<span class="stepper"
    >${input}<button type="button" class="step-btn minus" data-step="-1" aria-label="Zmniejsz: ${label}">
      −</button
    ><button type="button" class="step-btn" data-step="1" aria-label="Zwiększ: ${label}">+</button></span
  >`;
}

/** Wpis historii, który da się pokazać na liście z cofaniem. */
export interface HistoryItem {
  id: number;
  person: string;
  happenedOn: string;
  reverted: boolean;
}

/** Cofanie z historii: który wpis można cofnąć i dokąd wysłać formularz. */
export interface HistoryUndo {
  entryId: number | null;
  action: (entryId: number) => string;
  people: Person[];
  /** Dodatkowe ukryte pola formularza (np. skąd wrócić). */
  fields?: SafeHtml;
  /** Starsze wpisy, do których da się cofnąć naraz (od najnowszego), i dokąd wysłać takie cofnięcie. */
  olderEntryIds?: number[];
  olderAction?: (entryId: number) => string;
}

/**
 * Historia „kto, co, kiedy” (najnowsze na górze). Najnowszy działający wpis klika się,
 * żeby go cofnąć; starsze (z `olderEntryIds`) pozwalają cofnąć się do nich, kilka wpisów naraz.
 * Cofnięte wpisy są przekreślone.
 */
export function historyList<T extends HistoryItem>(
  entries: T[],
  text: (entry: T) => SafeHtml,
  undo: HistoryUndo,
): SafeHtml {
  const line = (h: T) => html`${avatar(h.person)}<time>${formatDate(h.happenedOn)}</time> ${text(h)}`;
  const older = undo.olderEntryIds ?? [];
  const item = (h: T) => {
    if (h.reverted) return html`<li class="reverted"><s>${line(h)}</s> <small>(cofnięte)</small></li>`;
    if (h.id === undo.entryId) {
      return undoItem(line(h), 'cofnij', 'Kto cofa? Kliknij swoje imię:', () =>
        personButtons(undo.action(h.id), 'Cofnij', undo.people, 'danger', undo.fields ?? null),
      );
    }
    const index = older.indexOf(h.id);
    if (index < 0 || !undo.olderAction) return html`<li>${line(h)}</li>`;
    // +2: ten wpis i najnowszy (który nie jest na liście starszych)
    const count = entriesText(index + 2);
    const action = undo.olderAction(h.id);
    return undoItem(
      line(h),
      'cofnij do tego miejsca',
      `Cofnie ${count} (ten i nowsze), tylko w tym zleceniu. Kto cofa? Kliknij swoje imię:`,
      () => personButtons(action, `Cofnij ${count}`, undo.people, 'danger', undo.fields ?? null, true),
      true,
    );
  };
  return html`<ul class="history">
    ${[...entries].reverse().map(item)}
  </ul>`;
}

/** Wpis historii, który po kliknięciu rozwija przyciski cofania. */
function undoItem(
  line: SafeHtml,
  hint: string,
  ask: string,
  buttons: () => SafeHtml,
  older = false,
): SafeHtml {
  return html`<li class="can-undo${older ? ' back-to' : ''}">
    <details class="undo-entry">
      <summary>
        ${line} <span class="undo-hint"><span aria-hidden="true">↶</span> ${hint}</span>
      </summary>
      <p class="who-asks">${ask}</p>
      ${buttons()}
    </details>
  </li>`;
}

/** „1 wpis”, „3 wpisy”, „5 wpisów”, „22 wpisy” (polska odmiana). */
export function entriesText(count: number): string {
  return countText(count, 'wpis', 'wpisy', 'wpisów');
}

/** Liczba z polską odmianą: 1 → `one`, 2–4 (bez 12–14) → `few`, reszta → `many`. */
export function countText(count: number, one: string, few: string, many: string): string {
  if (count === 1) return `1 ${one}`;
  const lastDigit = count % 10;
  const lastTwo = count % 100;
  const isFew = lastDigit >= 2 && lastDigit <= 4 && (lastTwo < 12 || lastTwo > 14);
  return `${count} ${isFew ? few : many}`;
}
