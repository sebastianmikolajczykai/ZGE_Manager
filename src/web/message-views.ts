import { html, type SafeHtml } from './html.js';
import { fold, formatDate, personButtons } from './view-helpers.js';
import type { Person } from '../modules/people/people-repository.js';
import type { MessageSettingsHistoryEntry } from '../modules/settings/message-settings.js';

/**
 * Ramka „Wiadomość do klienta (SMS)” na karcie zlecenia czekającego na zapłatę.
 * `text` = gotowa wiadomość albo null, gdy w Ustawieniach brak numeru konta.
 * Przycisk tylko kopiuje tekst (skrypt strony, po atrybucie data-copy); program niczego nie wysyła.
 */
export function paymentMessageBox(text: string | null, phone: string): SafeHtml {
  const body =
    text === null
      ? html`<p class="error">
          Uzupełnij numer konta w Ustawieniach, wtedy pojawi się tu gotowa wiadomość.
          <a href="/ustawienia#wiadomosc">Przejdź do Ustawień →</a>
        </p>`
      : html`<textarea id="sms-tekst" class="sms-text" readonly rows="7" aria-label="Treść wiadomości">
${text}</textarea>
          <p class="sms-actions">
            <button type="button" class="primary" data-copy="sms-tekst">📋 Kopiuj wiadomość</button>
            <small>Program niczego nie wysyła, tylko kopiuje tekst. Wklej go w telefonie.</small>
          </p>`;
  return html`<div class="sms-box">
    <p class="now-label">✉️ Wiadomość do klienta (SMS) · wyślij na: ${phone}</p>
    ${body}
  </div>`;
}

/** Wartości pól w formularzu (zapisane albo właśnie wpisane, gdy był błąd). */
export interface MessageSettingsView {
  values: Record<string, string>;
  history: MessageSettingsHistoryEntry[];
}

/** Ustawienia → Wiadomość do klienta: numer konta i link do opinii Google. */
export function messageSettingsSection(view: MessageSettingsView, people: Person[]): SafeHtml {
  const fields = html`<label class="setting wide"
      ><span>Numer konta</span><small>26 cyfr; trafi do wiadomości dla klienta</small
      ><input
        name="bankAccount"
        class="text"
        inputmode="numeric"
        value="${view.values.bankAccount ?? ''}" /></label
    ><label class="setting wide"
      ><span>Link do opinii Google</span><small>opcjonalnie; bez linku zdanie o opinii nie pojawi się</small
      ><input name="reviewLink" class="text" value="${view.values.reviewLink ?? ''}"
    /></label>`;
  return html`<h3 id="wiadomosc">Wiadomość do klienta (SMS)</h3>
    <p>
      <small>Gotowa wiadomość o zapłacie pojawia się na karcie zlecenia, gdy czeka ono na zapłatę.</small>
    </p>
    ${personButtons('/ustawienia/wiadomosc', 'Zapisz dane SMS', people, 'primary', fields)}
    ${fold('message-history', `Historia zmian (${view.history.length})`, historyList(view.history))}`;
}

function historyList(history: MessageSettingsHistoryEntry[]): SafeHtml {
  if (history.length === 0) return html`<p><small>Jeszcze nikt nic nie zmieniał.</small></p>`;
  return html`<ul class="history">
    ${history.map(
      (h) =>
        html`<li>
          <time>${formatDate(h.happenedOn)}</time> ${h.person}: ${h.label} ${h.oldValue || 'brak'} →
          ${h.newValue || 'brak'}
        </li>`,
    )}
  </ul>`;
}
