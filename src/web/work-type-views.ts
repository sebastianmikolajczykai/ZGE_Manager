import { html, type SafeHtml } from './html.js';
import { fold, formatDate, numberStepper, personButtons } from './view-helpers.js';
import type { Person } from '../modules/people/people-repository.js';
import type { WorkType } from '../modules/work-types/work-type-repository.js';
import type { WorkTypeAction, WorkTypeHistoryEntry } from '../modules/work-types/work-type-admin.js';
import { STEP_KINDS, STEP_KIND_LABELS } from '../modules/work-types/work-type-definition.js';
import type { StepDraft, WorkTypeDraft } from './work-type-form.js';

const ACTION_LABEL: Record<WorkTypeAction, string> = {
  created: 'dodanie',
  changed: 'zmiana',
  copied: 'kopia',
  hidden: 'ukrycie',
  shown: 'przywrócenie',
  deleted: 'usunięcie',
};

/** Sekcja na ekranie Ustawień: lista rodzajów prac i historia ich zmian. */
export function workTypesSection(workTypes: WorkType[], history: WorkTypeHistoryEntry[]): SafeHtml {
  return html`<h3 id="rodzaje-prac">Rodzaje prac</h3>
    <p><small>Kroki, ich kolejność i limity. Zmiany dotyczą tylko nowych zleceń.</small></p>
    <ul class="work-types">
      ${workTypes.map(
        (w) =>
          html`<li>
            <a href="/ustawienia/prace/${w.id}">${w.name}</a> <small>${stepsCount(w.steps.length)}</small>
            ${w.hidden ? html`<small class="hidden-mark">(ukryty)</small>` : ''}
          </li>`,
      )}
    </ul>
    <p><a class="button secondary" href="/ustawienia/prace/nowy">+ Nowy rodzaj pracy</a></p>
    ${fold('work-type-history', `Historia zmian rodzajów prac (${history.length})`, workTypeHistory(history))}`;
}

function workTypeHistory(history: WorkTypeHistoryEntry[]): SafeHtml {
  if (history.length === 0) return html`<p><small>Jeszcze nikt nic nie zmieniał.</small></p>`;
  return html`<ul class="history">
    ${history.map(
      (h) =>
        html`<li>
          <time>${formatDate(h.happenedOn)}</time> ${h.person}: ${ACTION_LABEL[h.action]} „${h.workTypeName}”
        </li>`,
    )}
  </ul>`;
}

/** „1 krok”, „3 kroki”, „13 kroków”. */
export function stepsCount(n: number): string {
  const lastTwo = n % 100;
  const last = n % 10;
  if (n === 1) return '1 krok';
  if (last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14)) return `${n} kroki`;
  return `${n} kroków`;
}

export interface EditorState {
  /** null = nowy rodzaj pracy. */
  workType: WorkType | null;
  draft: WorkTypeDraft;
  people: Person[];
  error: string | null;
  notice: 'saved' | 'unsaved' | null;
}

/** Edytor rodzaju pracy: nazwa, tabela kroków (↑ ↓ ✕), + Dodaj krok, Zapisz: osoba. */
export function workTypeEditor(state: EditorState): SafeHtml {
  const { workType, draft, people, error, notice } = state;
  const action = workType ? `/ustawienia/prace/${workType.id}` : '/ustawienia/prace';
  return html`<section class="form-page wide">
    <p><a href="/ustawienia">← Ustawienia</a></p>
    <h2>${workType ? `Rodzaj pracy: ${workType.name}` : 'Nowy rodzaj pracy'}</h2>
    ${error ? html`<p class="error" role="alert">${error}</p>` : ''}
    ${notice === 'saved' ? html`<p class="notice" role="status">Zapisano. Zmiany dotyczą nowych zleceń.</p>` : ''}
    ${notice === 'unsaved' ? html`<p class="notice warn" role="status">Zmiany nie są jeszcze zapisane – na dole kliknij „Zapisz”.</p>` : ''}
    <form method="post" action="${action}" class="work-type-form" novalidate>
      <button class="default-submit" name="op" value="noop" tabindex="-1" aria-hidden="true">Odśwież</button>
      <label class="wt-name">Nazwa rodzaju pracy <input name="workTypeName" value="${draft.name}" /></label>
      <input type="hidden" name="stepCount" value="${draft.steps.length}" />
      <table class="steps-editor">
        <thead>
          <tr>
            <th>Nr</th>
            <th>Krok</th>
            <th>Rodzaj</th>
            <th>Limit (dni rob.)</th>
            <th>Razem z poprzednim</th>
            <th>Zapłata</th>
            <th>Kolejność</th>
          </tr>
        </thead>
        <tbody>
          ${draft.steps.map((s, i) => stepRow(s, i + 1, draft.steps.length))}
        </tbody>
      </table>
      <label class="choice"
        ><input type="radio" name="payment" value="" ${draft.steps.some((s) => s.payment) ? '' : 'checked'} />
        Bez kroku zapłaty</label
      >
      <p><button class="secondary" name="op" value="add">+ Dodaj krok</button></p>
      <ul class="hints">
        <li>Limit puste = bez limitu. „Sprawdzamy codziennie” i „W ustalonym dniu” nie mają limitu.</li>
        <li>
          Razem z poprzednim: krok startuje tego samego dnia co krok nad nim (np. termin pomiaru i analiza
          materiałów). Każdy ma własny limit, osobę i przycisk; następny krok rusza, gdy oba są zrobione.
        </li>
        <li>Zapłata: od tego kroku zlecenie przechodzi z Tablicy do zakładki Niezapłacone.</li>
        <li>
          Zapisanie zatwierdza limity (znika dopisek „do potwierdzenia”). Otwarte zlecenia się nie zmieniają.
        </li>
      </ul>
      <div class="people">
        ${people.map((p) => html`<button class="primary" name="person" value="${p.name}">Zapisz: ${p.name}</button>`)}
      </div>
    </form>
    ${workType ? moreActions(workType, people) : ''}
  </section>`;
}

/** Pole „razem z poprzednim” (krok 1 go nie ma, bo nie ma kroku przed nim). */
function parallelBox(step: StepDraft, n: number): SafeHtml {
  return html`<input
    type="checkbox"
    name="stepParallel_${n}"
    value="1"
    ${step.parallel ? 'checked' : ''}
    aria-label="Krok ${n} w tym samym czasie co krok ${n - 1}"
  />`;
}

function stepRow(step: StepDraft, n: number, total: number): SafeHtml {
  return html`<tr>
    <td class="num">${n}.</td>
    <td><input name="stepName_${n}" value="${step.name}" aria-label="Nazwa kroku ${n}" /></td>
    <td>
      <select name="stepKind_${n}" aria-label="Rodzaj kroku ${n}">
        ${STEP_KINDS.map(
          (k) =>
            html`<option value="${k}" ${step.kind === k ? 'selected' : ''}>${STEP_KIND_LABELS[k]}</option>`,
        )}
      </select>
    </td>
    <td>
      ${numberStepper(
        `Limit kroku ${n} (dni roboczych)`,
        html`<input
          name="stepLimit_${n}"
          value="${step.limit}"
          inputmode="numeric"
          class="limit"
          min="1"
          max="365"
          aria-label="Limit kroku ${n} (dni roboczych)"
        />`,
      )}
    </td>
    <td class="center">${n === 1 ? '' : parallelBox(step, n)}</td>
    <td class="center">
      <input
        type="radio"
        name="payment"
        value="${n}"
        ${step.payment ? 'checked' : ''}
        aria-label="Krok ${n} to zapłata"
      />
    </td>
    <td class="order-buttons">
      <button
        class="small"
        name="op"
        value="up:${n}"
        ${n === 1 ? 'disabled' : ''}
        aria-label="Krok ${n} w górę"
      >
        ↑
      </button>
      <button
        class="small"
        name="op"
        value="down:${n}"
        ${n === total ? 'disabled' : ''}
        aria-label="Krok ${n} w dół"
      >
        ↓
      </button>
      <button class="small danger" name="op" value="remove:${n}" aria-label="Usuń krok ${n}">✕</button>
    </td>
  </tr>`;
}

function moreActions(w: WorkType, people: Person[]): SafeHtml {
  return html`<details class="undo">
    <summary class="button undo-toggle">Więcej: kopiuj, ukryj, usuń</summary>
    <h3>Kopia</h3>
    <p><small>Nowy rodzaj pracy z tymi samymi krokami, np. „Granice” na bazie „Podziału”.</small></p>
    ${personButtons(`/ustawienia/prace/${w.id}/kopiuj`, 'Kopiuj', people, 'secondary')}
    <h3>${w.hidden ? 'Przywróć' : 'Ukryj'}</h3>
    <p>
      <small
        >Ukryty rodzaj pracy nie pojawia się przy nowym zleceniu ani ofercie. Stare zlecenia działają
        dalej.</small
      >
    </p>
    ${
      w.hidden
        ? personButtons(`/ustawienia/prace/${w.id}/pokaz`, 'Przywróć', people, 'secondary')
        : personButtons(`/ustawienia/prace/${w.id}/ukryj`, 'Ukryj', people, 'secondary')
    }
    <h3>Usuń</h3>
    <p><small>Usunąć można tylko rodzaj pracy, którego nie ma w żadnym zleceniu ani ofercie.</small></p>
    ${personButtons(`/ustawienia/prace/${w.id}/usun`, 'Usuń', people, 'danger')}
  </details>`;
}
