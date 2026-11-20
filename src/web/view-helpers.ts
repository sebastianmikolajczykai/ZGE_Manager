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
): SafeHtml {
  if (people.length === 0) return html`<p class="error">Dodaj osoby w Ustawieniach.</p>`;
  return html`<form method="post" action="${action}" class="people">
    ${fields}
    ${people.map(
      (p) =>
        html`<button
          class="${style} person"
          style="--p:${personColour(p.name)}"
          name="person"
          value="${p.name}"
        >
          ${avatar(p.name)} ${label}: ${p.name}
        </button>`,
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
  return html`<span class="stepper"
    ><button type="button" class="step-btn" data-step="-1" aria-label="Zmniejsz: ${label}">−</button
    >${input}<button type="button" class="step-btn" data-step="1" aria-label="Zwiększ: ${label}">
      +
    </button></span
  >`;
}
