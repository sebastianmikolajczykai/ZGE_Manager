import { html, type SafeHtml } from './html.js';
import { fold, formatDate, personButtons } from './view-helpers.js';
import type { Person } from '../modules/people/people-repository.js';
import {
  DEFAULT_APP_SETTINGS,
  SETTING_FIELDS,
  type AppSettings,
  type SettingField,
  type SettingsHistoryEntry,
} from '../modules/settings/settings-service.js';

/** Co pokazać w formularzu: zapisane ustawienia albo to, co ktoś właśnie wpisał (przy błędzie). */
export interface SettingsView {
  values: Record<string, string>;
  history: SettingsHistoryEntry[];
}

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
  return html`<section class="form-page">
    <h2>Ustawienia</h2>
    ${error ? html`<p class="error" role="alert">${error}</p>` : ''}
    <h3>Kolory i przypomnienia</h3>
    <p><small>Liczymy tylko dni robocze (pn–pt) bez świąt. Zmiany działają od razu.</small></p>
    ${personButtons('/ustawienia/progi', 'Zapisz', people, 'primary', settingFields(view.values))}
    <details class="undo">
      <summary class="button undo-toggle"><span aria-hidden="true">↺</span> Przywróć domyślne</summary>
      <p><small>${defaultsSummary()}</small></p>
      ${personButtons('/ustawienia/progi/domyslne', 'Przywróć domyślne', people, 'danger')}
    </details>
    ${fold('settings-history', `Historia zmian ustawień (${view.history.length})`, historyList(view.history))}
    <h3>Osoby (przyciski „kto zrobił”)</h3>
    <ul class="people-list">
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
    </form>
  </section>`;
}

function settingFields(values: Record<string, string>): SafeHtml {
  return html`${SETTING_FIELDS.map((field) => settingField(field, values[field.key] ?? ''))}`;
}

function settingField(field: SettingField, value: string): SafeHtml {
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
  return html`<label class="setting"
    ><span>${field.label}</span>${hint}<input
      type="number"
      name="${field.key}"
      min="${field.min}"
      max="${field.max}"
      step="1"
      required
      value="${value}"
  /></label>`;
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
