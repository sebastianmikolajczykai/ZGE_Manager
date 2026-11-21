import { html, type SafeHtml } from './html.js';
import {
  countText,
  fold,
  formatDate,
  numberStepper,
  personButtonList,
  personButtons,
} from './view-helpers.js';
import type { Person } from '../modules/people/people-repository.js';
import {
  DEFAULT_APP_SETTINGS,
  SETTING_FIELDS,
  type AppSettings,
  type SettingField,
  type SettingErrors,
  type SettingsHistoryEntry,
} from '../modules/settings/settings-service.js';
import type { DaysOff } from '../modules/settings/days-off-repository.js';
import type { WorkType } from '../modules/work-types/work-type-repository.js';
import type { WorkTypeHistoryEntry } from '../modules/work-types/work-type-admin.js';
import { workTypesSection } from './work-type-views.js';
import { messageSettingsSection, type MessageSettingsView } from './message-views.js';

/** Potwierdzenie po zapisie: ile pól się zmieniło i kto zapisał. */
export interface SavedNote {
  count: number;
  person: string;
}

/** Co pokazać w formularzu: zapisane ustawienia albo to, co ktoś właśnie wpisał (przy błędzie). */
export interface SettingsView {
  values: Record<string, string>;
  /** Błąd przy konkretnym polu (zapis odrzucony). */
  fieldErrors: SettingErrors;
  /** Uwaga przy polu (zapis dozwolony), np. „Żółte przed limitem” ≥ limit kroku. */
  fieldNotices: SettingErrors;
  saved: SavedNote | null;
  history: SettingsHistoryEntry[];
  daysOff: DaysOff[];
  workTypes: WorkType[];
  workTypeHistory: WorkTypeHistoryEntry[];
  message: MessageSettingsView;
  /** Sekcja rozwinięta od razu (po zapisie albo przy błędzie), żeby było widać wynik. */
  openSection?: SettingsSectionId;
}

/** Sekcje Ustawień; id = kotwica w adresie (np. /ustawienia#osoby) i w menu u góry. */
export type SettingsSectionId = 'kolory' | 'rodzaje-prac' | 'dni-wolne' | 'wiadomosc' | 'osoby';

/** Ustawienia jako wartości pól formularza (przełącznik: '1' = włączony, brak = wyłączony). */
export function settingsFormValues(settings: AppSettings): Record<string, string> {
  const values: Record<string, string> = {};
  for (const field of SETTING_FIELDS) {
    const value = settings[field.key];
    if (typeof value === 'boolean') {
      if (value) values[field.key] = '1';
    } else {
      values[field.key] = String(value);
    }
  }
  return values;
}

export function settingsPage(people: Person[], view: SettingsView, error: string | null): SafeHtml {
  const open = view.openSection;
  return html`<section class="form-page">
    <h2>Ustawienia</h2>
    <nav class="settings-nav" aria-label="Sekcje ustawień">
      <a href="#kolory">🎨 Kolory i przypomnienia</a><a href="#rodzaje-prac">🧭 Rodzaje prac</a
      ><a href="#dni-wolne">🏖 Dni wolne</a><a href="#wiadomosc">✉️ Wiadomość SMS</a
      ><a href="#osoby">👥 Osoby</a>
    </nav>
    ${error ? html`<p class="error" role="alert">${error}</p>` : ''}
    <p class="settings-hint"><small>Kliknij nazwę sekcji, żeby ją rozwinąć albo zwinąć.</small></p>
    ${section('kolory', 'Kolory i przypomnienia', null, coloursSection(people, view), open)}
    ${section(
      'rodzaje-prac',
      'Rodzaje prac',
      view.workTypes.length,
      workTypesSection(view.workTypes, view.workTypeHistory),
      open,
    )}
    ${section('dni-wolne', 'Dni wolne firmy', view.daysOff.length, daysOffSection(view.daysOff, people), open)}
    ${section('wiadomosc', 'Wiadomość do klienta (SMS)', null, messageSettingsSection(view.message, people), open)}
    ${section('osoby', 'Osoby (przyciski „kto zrobił”)', people.length, peopleSection(people), open)}
  </section>`;
}

/** Jedna zwijana sekcja; przeglądarka pamięta, czy była rozwinięta (data-fold). */
function section(
  id: SettingsSectionId,
  title: string,
  count: number | null,
  body: SafeHtml,
  open: SettingsSectionId | undefined,
): SafeHtml {
  const countHtml = count === null ? '' : html` <small class="count">(${count})</small>`;
  return html`<details
    class="fold settings-section"
    id="${id}"
    data-fold="ustawienia-${id}"
    ${open === id ? 'open' : ''}
  >
    <summary><h3>${title}${countHtml}</h3></summary>
    <div class="section-body">${body}</div>
  </details>`;
}

function coloursSection(people: Person[], view: SettingsView): SafeHtml {
  return html`<p>
      <small>Liczymy tylko dni robocze (pn–pt) bez świąt. Zmiany działają od razu po zapisaniu.</small>
    </p>
    ${savedNote(view.saved)} ${thresholdsForm(people, view)}
    <details class="undo">
      <summary class="button undo-toggle"><span aria-hidden="true">↺</span> Przywróć domyślne</summary>
      <p><small>${defaultsSummary()}</small></p>
      ${personButtons('/ustawienia/progi/domyslne', 'Przywróć domyślne', people, 'danger')}
    </details>
    ${fold('settings-history', `Historia zmian ustawień (${view.history.length})`, historyList(view.history))}`;
}

function peopleSection(people: Person[]): SafeHtml {
  return html`<ul class="people-list">
      ${people.map(
        (p) =>
          html`<li>
            ${p.name}
            <form method="post" action="/ustawienia/osoby/${p.id}/usun">
              <button class="danger small">Usuń</button>
            </form>
          </li>`,
      )}
    </ul>
    <form method="post" action="/ustawienia/osoby" class="inline">
      <label>Imię <input name="name" required /></label><button class="primary">Dodaj osobę</button>
    </form>`;
}

function daysOffSection(daysOff: DaysOff[], people: Person[]): SafeHtml {
  const fields = html`<label class="setting"
      ><span>Od</span><input type="date" name="fromOn" required /></label
    ><label class="setting"
      ><span>Do</span><small>puste = jeden dzień</small><input type="date" name="toOn" /></label
    ><label class="setting"
      ><span>Powód</span><small>opcjonalnie, np. urlop</small><input name="note" class="text"
    /></label>`;
  return html`<p><small>Urlop, długi weekend: te dni nie liczą się do limitów, tak jak święta.</small></p>
    ${
      daysOff.length === 0
        ? html`<p><small>Brak zaplanowanych dni wolnych.</small></p>`
        : html`<ul class="people-list">
            ${daysOff.map(
              (d) =>
                html`<li>
                  <span
                    >${formatDate(d.fromOn)}${d.toOn === d.fromOn ? '' : html` – ${formatDate(d.toOn)}`}
                    ${d.note ?? ''} <small>(kto wpisał: ${d.addedBy})</small></span
                  >
                  <form method="post" action="/ustawienia/dni-wolne/${d.id}/usun">
                    <button class="danger small">Usuń</button>
                  </form>
                </li>`,
            )}
          </ul>`
    }
    ${personButtons('/ustawienia/dni-wolne', 'Dodaj dni wolne', people, 'secondary', fields)}`;
}

/** Etykieta przycisków zapisu (także w data-label i w testach E2E). */
export const SAVE_LABEL = '💾 Zapisz zmiany';

/**
 * Formularz progów. novalidate: sprawdza serwer i pokazuje komunikat po polsku przy polu
 * (zamiast dymków przeglądarki). data-dirty-form: skrypt podświetla niezapisane zmiany.
 */
function thresholdsForm(people: Person[], view: SettingsView): SafeHtml {
  if (people.length === 0) return html`<p class="error">Dodaj osoby w Ustawieniach.</p>`;
  // Po odrzuconym zapisie wszystko w polach jest niezapisane od początku.
  const unsaved = Object.keys(view.fieldErrors).length > 0 ? '1' : '0';
  return html`<form
    method="post"
    action="/ustawienia/progi"
    class="people settings-form"
    data-dirty-form="${unsaved}"
    novalidate
  >
    ${SETTING_FIELDS.map((field) =>
      settingField(
        field,
        view.values[field.key] ?? '',
        view.fieldErrors[field.key],
        view.fieldNotices[field.key],
      ),
    )}
    <div class="save-box">
      <p class="save-title">
        <strong>${SAVE_LABEL}</strong>
        <span class="dirty-note" ${unsaved === '1' ? '' : 'hidden'}
          >Niezapisane zmiany<span class="dirty-count"></span
        ></span>
      </p>
      <p class="who-asks">Kto zapisuje? Kliknij swoje imię:</p>
      <div class="people">${personButtonList(SAVE_LABEL, people, 'primary')}</div>
    </div>
  </form>`;
}

function savedNote(saved: SavedNote | null): SafeHtml | string {
  if (!saved) return '';
  if (saved.count === 0) {
    return html`<p class="saved none" role="status">
      Nic nie zmieniono: wartości były takie same jak zapisane.
    </p>`;
  }
  const changes = countText(saved.count, 'zmianę', 'zmiany', 'zmian');
  return html`<p class="saved" role="status">✓ Zapisano ${changes} (${saved.person}). Działają od razu.</p>`;
}

function settingField(field: SettingField, value: string, error?: string, notice?: string): SafeHtml {
  const hint = field.hint ? html`<small>${field.hint}</small>` : '';
  if (field.type === 'switch') {
    return html`<label class="setting"
      ><span>${field.label}</span>${hint}<input
        type="checkbox"
        name="${field.key}"
        value="1"
        ${value ? 'checked' : ''}
    /></label>`;
  }
  const messageId = `msg-${field.key}`;
  const invalid = error ? html` aria-invalid="true"` : '';
  const describedBy = error || notice ? html` aria-describedby="${messageId}"` : '';
  const input = html`<input
    type="number"
    name="${field.key}"
    min="${field.min}"
    max="${field.max}"
    step="1"
    value="${value}"
    ${invalid}${describedBy}
  />`;
  const message = error
    ? html`<small class="field-error" id="${messageId}">${error}</small>`
    : notice
      ? html`<small class="field-notice" id="${messageId}">${notice}</small>`
      : '';
  return html`<label class="setting${error ? ' has-error' : ''}"
    ><span>${field.label}</span>${hint}${numberStepper(field.label, input)}${message}</label
  >`;
}

function defaultsSummary(): string {
  const d = DEFAULT_APP_SETTINGS;
  return (
    `Żółte po ${d.yellowAfterIdleDays} i czerwone po ${d.redAfterIdleDays} dniach bez ruchu, ` +
    `żółte ${d.warnDaysBeforeLimit} dzień przed limitem, miganie po ${d.blinkAfterRedDays} dniach na czerwono, ` +
    `oferta po ${d.offerFollowUpDays} dniach, odświeżanie co ${d.refreshSeconds} s.`
  );
}

function historyList(history: SettingsHistoryEntry[]): SafeHtml {
  if (history.length === 0) return html`<p><small>Jeszcze nikt nic nie zmieniał.</small></p>`;
  return html`<ul class="history">
    ${history.map(
      (h) =>
        html`<li>
          <time>${formatDate(h.happenedOn)}</time> ${h.person}: „${h.label}” ${h.oldValue} → ${h.newValue}
        </li>`,
    )}
  </ul>`;
}
