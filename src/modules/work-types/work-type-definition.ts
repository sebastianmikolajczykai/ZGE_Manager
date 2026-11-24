/**
 * Rodzaj kroku:
 * - own: robimy my, ma limit dni,
 * - waiting: czekamy na urząd lub klienta, ma (opcjonalny) limit dni,
 * - daily: sprawdzamy codziennie („Sprawdzone dziś” / „Zakończone”), bez limitu,
 * - scheduled: dzieje się w ustalonym dniu (np. pomiar w terenie), bez limitu.
 */
export const STEP_KINDS = ['own', 'waiting', 'daily', 'scheduled'] as const;
export type StepKind = (typeof STEP_KINDS)[number];

/** Nazwy rodzajów kroków na ekranie (Łukasz edytuje kroki sam). */
export const STEP_KIND_LABELS: Record<StepKind, string> = {
  own: 'Robimy my',
  waiting: 'Czekamy (urząd / klient)',
  daily: 'Sprawdzamy codziennie',
  scheduled: 'W ustalonym dniu (np. pomiar)',
};

/** Te rodzaje kroków nie mają limitu dni. */
export const KINDS_WITHOUT_LIMIT: readonly StepKind[] = ['daily', 'scheduled'];

export interface StepTemplate {
  name: string;
  kind: StepKind;
  /** Ile dni roboczych może trwać krok; null = bez limitu. */
  limitDays: number | null;
  /** true = limit to założenie, do potwierdzenia przez klienta. */
  provisional: boolean;
  /** true = krok „Zapłata”: zlecenie przechodzi wtedy z tablicy do zakładki Niezapłacone. */
  payment?: boolean;
  /**
   * true = krok startuje razem z poprzednim (ten sam dzień 0, osobny limit, osoba i przycisk).
   * Następny krok zaczyna się dopiero, gdy wszystkie kroki z takiej grupy są odhaczone.
   */
  parallel?: boolean;
}

export interface WorkTypeDefinition {
  name: string;
  steps: StepTemplate[];
}

/** Rzuca czytelny błąd, gdy definicja rodzaju pracy jest niepoprawna. */
export function validateWorkType(def: WorkTypeDefinition): void {
  if (!def.name.trim()) throw new Error('Rodzaj pracy musi mieć nazwę');
  if (def.steps.length === 0) throw new Error(`Rodzaj pracy „${def.name}” musi mieć co najmniej jeden krok`);
  const seen = new Set<string>();
  def.steps.forEach((step, index) => {
    validateStep(step, index + 1);
    const key = step.name.trim().toLowerCase();
    if (seen.has(key)) throw new Error(`Krok „${step.name}” powtarza się w „${def.name}”`);
    seen.add(key);
  });
  if (def.steps.filter((s) => s.payment).length > 1) {
    throw new Error(`Rodzaj pracy „${def.name}” może mieć tylko jeden krok zapłaty`);
  }
  validateParallel(def.steps);
}

/** Krok 1 nie ma poprzednika; krok zapłaty zawsze idzie sam (od niego zlecenie przechodzi do Niezapłaconych). */
function validateParallel(steps: StepTemplate[]): void {
  steps.forEach((step, index) => {
    if (!step.parallel) return;
    if (index === 0)
      throw new Error(`Krok 1 („${step.name}”) nie może być równoległy: nie ma kroku przed nim`);
    const previous = steps[index - 1] as StepTemplate;
    if (step.payment || previous.payment) {
      const payment = step.payment ? step : previous;
      throw new Error(`Krok zapłaty „${payment.name}” nie może iść równolegle z innym krokiem`);
    }
  });
}

function validateStep(step: StepTemplate, position: number): void {
  if (!step.name.trim()) throw new Error(`Krok ${position} musi mieć nazwę`);
  if (!STEP_KINDS.includes(step.kind)) throw new Error(`Krok ${position}: nieznany rodzaj „${step.kind}”`);
  if (step.payment && (step.kind !== 'waiting' || step.limitDays === null)) {
    throw new Error(
      `Krok zapłaty „${step.name}” musi być typu „${STEP_KIND_LABELS.waiting}” i mieć limit dni`,
    );
  }
  if (step.limitDays === null) return;
  if (KINDS_WITHOUT_LIMIT.includes(step.kind)) {
    throw new Error(
      `Krok ${position} („${step.name}”) nie ma limitu dni, bo jest typu „${STEP_KIND_LABELS[step.kind]}”`,
    );
  }
  if (!Number.isInteger(step.limitDays) || step.limitDays < 1) {
    throw new Error(
      `Krok ${position}: limit musi być liczbą całkowitą co najmniej 1 (jest ${step.limitDays})`,
    );
  }
}
