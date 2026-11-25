import {
  KINDS_WITHOUT_LIMIT,
  type StepKind,
  type WorkTypeDefinition,
} from '../modules/work-types/work-type-definition.js';
import type { WorkType } from '../modules/work-types/work-type-repository.js';
import type { Form } from './http.js';

/**
 * Edytor rodzaju pracy działa bez JavaScriptu: każdy przycisk (↑ ↓ ✕ + krok) wysyła cały formularz,
 * serwer zmienia wersję roboczą i pokazuje ją znowu. Zapis do bazy dopiero po „Zapisz: osoba”.
 */
export interface StepDraft {
  name: string;
  kind: StepKind;
  /** Tekst z pola (puste = bez limitu). */
  limit: string;
  payment: boolean;
  /** Krok idzie w tym samym czasie co poprzedni. */
  parallel: boolean;
}

export interface WorkTypeDraft {
  name: string;
  steps: StepDraft[];
}

const DEFAULT_NEW_STEP: StepDraft = { name: '', kind: 'own', limit: '2', payment: false, parallel: false };
const MAX_STEPS = 40;

export function emptyDraft(): WorkTypeDraft {
  return { name: '', steps: [{ ...DEFAULT_NEW_STEP }] };
}

export function draftFromWorkType(w: WorkType): WorkTypeDraft {
  return {
    name: w.name,
    steps: w.steps.map((s) => ({
      name: s.name,
      kind: s.kind,
      limit: s.limitDays === null ? '' : String(s.limitDays),
      payment: s.payment,
      parallel: s.parallel ?? false,
    })),
  };
}

export function draftFromForm(form: Form): WorkTypeDraft {
  const count = Math.min(Math.max(Number(form.stepCount) || 0, 0), MAX_STEPS);
  const steps: StepDraft[] = [];
  for (let i = 1; i <= count; i++) {
    steps.push({
      name: form[`stepName_${i}`] ?? '',
      kind: (form[`stepKind_${i}`] ?? 'own') as StepKind,
      limit: form[`stepLimit_${i}`] ?? '',
      payment: form.payment === String(i),
      parallel: form[`stepParallel_${i}`] !== undefined,
    });
  }
  return { name: form.workTypeName ?? '', steps };
}

/** Operacja z przycisku: add, up:N, down:N, remove:N (N liczone od 1). Nieznana = bez zmian. */
export function applyOp(draft: WorkTypeDraft, op: string): WorkTypeDraft {
  const steps = [...draft.steps];
  const [action = '', number] = op.split(':');
  OPERATIONS[action]?.(steps, Number(number) - 1);
  return { ...draft, steps };
}

const OPERATIONS: Record<string, (steps: StepDraft[], i: number) => void> = {
  add: (steps) => {
    if (steps.length < MAX_STEPS) steps.push({ ...DEFAULT_NEW_STEP });
  },
  remove: (steps, i) => {
    if (steps[i]) steps.splice(i, 1);
  },
  up: (steps, i) => {
    if (i > 0 && steps[i]) swap(steps, i, i - 1);
  },
  down: (steps, i) => {
    if (i >= 0 && i < steps.length - 1) swap(steps, i, i + 1);
  },
};

/** Wersja robocza → definicja do zapisu. Zapis oznacza, że limity są ustalone (bez „do potwierdzenia”). */
export function definitionFromDraft(draft: WorkTypeDraft): WorkTypeDefinition {
  return {
    name: draft.name,
    steps: draft.steps.map((s, index) => ({
      name: s.name,
      kind: s.kind,
      limitDays: KINDS_WITHOUT_LIMIT.includes(s.kind) ? null : parseLimit(s, index + 1),
      provisional: false,
      payment: s.payment,
      // Pierwszy krok nie ma poprzednika (np. po przesunięciu kroku na górę).
      parallel: index > 0 && s.parallel,
    })),
  };
}

function parseLimit(step: StepDraft, position: number): number | null {
  const text = step.limit.trim();
  if (text === '') return null;
  const value = Number(text);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(
      `Krok ${position} („${step.name}”): limit musi być liczbą dni roboczych (np. 2) albo puste = bez limitu`,
    );
  }
  return value;
}

function swap(steps: StepDraft[], a: number, b: number): void {
  const first = steps[a] as StepDraft;
  steps[a] = steps[b] as StepDraft;
  steps[b] = first;
}
