import { html, type SafeHtml } from './html.js';
import { fold, formatDate, personButtons } from './view-helpers.js';
import type { Person } from '../modules/people/people-repository.js';
import type { SyncStatus } from '../modules/calendar-sync/calendar-sync-service.js';
import type { SyncHistoryAction } from '../modules/calendar-sync/calendar-sync-repository.js';

const ACTION_TEXT: Record<SyncHistoryAction, string> = {
  enabled: 'włączono synchronizację',
  disabled: 'wyłączono synchronizację',
  connected: 'połączono konto Google',
  disconnected: 'odłączono konto Google',
};

const TIME = new Intl.DateTimeFormat('pl-PL', {
  timeZone: 'Europe/Warsaw',
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

/** Ustawienia → Kalendarz Google. */
export function calendarSection(status: SyncStatus, people: Person[]): SafeHtml {
  return html`<h3 id="kalendarz">Kalendarz Google (przypomnienia „Zadzwoń”)</h3>
    <p>
      <small
        >Gdy synchronizacja jest włączona, przypomnienia o telefonie do klienta (oferty po terminie,
        niezapłacone zlecenia) same pojawiają się w osobnym kalendarzu „ZGE przypomnienia” na koncie Google.
        Po odznaczeniu w aplikacji znikają, a niezałatwione przechodzą na kolejny dzień roboczy. Do Google
        trafia tylko numer oferty lub zlecenia, data i link do aplikacji, bez imienia i nazwiska, telefonu i
        kwoty.</small
      >
    </p>
    ${status.configured ? configuredBody(status, people) : notConfigured()}
    ${fold('calendar-history', `Historia zmian (${status.history.length})`, historyList(status))}`;
}

/** Czerwony pasek na każdej stronie, gdy synchronizacja jest włączona, a ostatnia się nie udała. */
export function calendarBanner(status: SyncStatus): SafeHtml | string {
  if (!status.enabled || status.lastError === null) return '';
  return html`<p class="error calendar-banner" role="alert">
    📅 Kalendarz Google: ${status.lastError} <a href="/ustawienia#kalendarz">Ustawienia →</a>
  </p>`;
}

function notConfigured(): SafeHtml {
  return html`<p class="error">
    Brak kluczy Google w pliku .env (GOOGLE_CLIENT_ID i GOOGLE_CLIENT_SECRET). Synchronizacja jest
    niedostępna, reszta programu działa normalnie. Instrukcja konfiguracji jest w pliku README.
  </p>`;
}

function configuredBody(status: SyncStatus, people: Person[]): SafeHtml {
  const account = status.connected
    ? html`<p><strong>Konto Google: połączone ✓</strong></p>
        <details class="undo">
          <summary class="button undo-toggle">Odłącz konto Google</summary>
          ${personButtons('/kalendarz-google/odlacz', 'Odłącz', people, 'danger')}
        </details>`
    : html`<p><strong>Konto Google: niepołączone</strong></p>
        ${personButtons('/kalendarz-google/polacz', 'Połącz z Kalendarzem Google', people, 'secondary')}`;
  const toggle = status.enabled
    ? personButtons(
        '/kalendarz-google/wlacz',
        'Wyłącz synchronizację',
        people,
        'secondary',
        html`<input type="hidden" name="on" value="0" />`,
      )
    : personButtons(
        '/kalendarz-google/wlacz',
        'Włącz synchronizację',
        people,
        'primary',
        html`<input type="hidden" name="on" value="1" />`,
      );
  return html`${account}
    <p><strong>Synchronizacja: ${status.enabled ? 'włączona' : 'wyłączona'}</strong></p>
    ${toggle} ${lastSync(status)}
    ${status.lastError ? html`<p class="error" role="alert">${status.lastError}</p>` : ''}
    <form method="post" action="/kalendarz-google/synchronizuj" class="inline">
      <button class="secondary">🔄 Synchronizuj teraz</button>
    </form>`;
}

function lastSync(status: SyncStatus): SafeHtml {
  const when = status.lastOkAt ? TIME.format(new Date(status.lastOkAt)) : 'jeszcze nie było';
  return html`<p>
    <small>Ostatnia udana synchronizacja: ${when}. W kalendarzu: ${status.eventCount}.</small>
  </p>`;
}

function historyList(status: SyncStatus): SafeHtml {
  if (status.history.length === 0) return html`<p><small>Jeszcze nikt nic nie zmieniał.</small></p>`;
  return html`<ul class="history">
    ${status.history.map(
      (h) => html`<li><time>${formatDate(h.happenedOn)}</time> ${h.person}: ${ACTION_TEXT[h.action]}</li>`,
    )}
  </ul>`;
}
