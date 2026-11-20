import { describe, it, expect } from 'vitest';
import {
  STEP_KINDS,
  STEP_KIND_LABELS,
  validateWorkType,
  type StepTemplate,
  type WorkTypeDefinition,
} from '../../../src/modules/work-types/work-type-definition.js';
import { DEFAULT_WORK_TYPES } from '../../../src/modules/work-types/default-work-types.js';

const stepA: StepTemplate = { name: 'Krok A', kind: 'own', limitDays: 2, provisional: false };

const valid: WorkTypeDefinition = {
  name: 'Przykład',
  steps: [
    stepA,
    { name: 'Czekamy na urząd', kind: 'waiting', limitDays: 14, provisional: true },
    { name: 'Sprawdzaj codziennie', kind: 'daily', limitDays: null, provisional: false },
    { name: 'Pomiar', kind: 'scheduled', limitDays: null, provisional: false },
  ],
};

describe('validateWorkType', () => {
  it('accepts a correct definition', () => {
    expect(() => validateWorkType(valid)).not.toThrow();
  });

  it('rejects an empty name', () => {
    expect(() => validateWorkType({ ...valid, name: '   ' })).toThrow(/nazw/i);
  });

  it('rejects a work type without steps', () => {
    expect(() => validateWorkType({ ...valid, steps: [] })).toThrow(/co najmniej jeden krok/);
  });

  it('rejects an empty step name', () => {
    const steps = [{ ...stepA, name: '' }];
    expect(() => validateWorkType({ ...valid, steps })).toThrow(/Krok 1.*nazw/);
  });

  it('rejects duplicate step names', () => {
    const steps = [stepA, { ...stepA }];
    expect(() => validateWorkType({ ...valid, steps })).toThrow(/powtarza/);
  });

  it.each([0, -1, 2.5])('rejects a limit of %s days', (limitDays) => {
    const steps = [{ ...stepA, limitDays }];
    expect(() => validateWorkType({ ...valid, steps })).toThrow(/limit/i);
  });

  it('rejects an unknown step kind', () => {
    const steps = [{ ...stepA, kind: 'inne' as StepTemplate['kind'] }];
    expect(() => validateWorkType({ ...valid, steps })).toThrow(/nieznany rodzaj/);
  });

  it.each(['daily', 'scheduled'] as const)('rejects a day limit on a "%s" step', (kind) => {
    const steps = [{ name: 'X', kind, limitDays: 3, provisional: false }];
    expect(() => validateWorkType({ ...valid, steps })).toThrow(/nie ma limitu/);
  });
});

describe('payment step (Niezapłacone)', () => {
  const pay = (change: Partial<StepTemplate> = {}): StepTemplate => ({
    name: 'Zapłata',
    kind: 'waiting',
    limitDays: 14,
    provisional: true,
    payment: true,
    ...change,
  });

  it('accepts one waiting step with a limit marked as payment', () => {
    expect(() => validateWorkType({ name: 'P', steps: [stepA, pay()] })).not.toThrow();
  });

  it('rejects a payment step that is not a waiting step', () => {
    expect(() => validateWorkType({ name: 'P', steps: [pay({ kind: 'own' })] })).toThrow(/zapłat/i);
  });

  it('rejects a payment step without a limit', () => {
    expect(() => validateWorkType({ name: 'P', steps: [pay({ limitDays: null })] })).toThrow(/limit/i);
  });

  it('rejects two payment steps', () => {
    expect(() => validateWorkType({ name: 'P', steps: [pay(), pay({ name: 'Dopłata' })] })).toThrow(
      /jeden krok zapłaty/,
    );
  });
});

describe('default "Podział nieruchomości" template', () => {
  it('marks "Zapłata" (and only it) as the payment step', () => {
    const steps = DEFAULT_WORK_TYPES[0]?.steps ?? [];
    expect(steps.filter((s) => s.payment).map((s) => s.name)).toEqual(['Zapłata']);
  });

  const found = DEFAULT_WORK_TYPES.find((w) => w.name === 'Podział nieruchomości');
  if (!found) throw new Error('Brak szablonu podziału');
  const podzial = found;

  it('is valid', () => {
    expect(() => validateWorkType(podzial)).not.toThrow();
  });

  it('has the 13 agreed steps in order', () => {
    expect(podzial.steps.map((s) => s.name)).toEqual([
      'Ustalenie terminu pomiaru w terenie',
      'Analiza materiałów w urzędzie',
      'Wysłanie zawiadomień',
      'Wstępny projekt podziału',
      'Śledzenie zawiadomień (Poczta Polska)',
      'Protokoły i przygotowanie do wyjazdu w teren',
      'Pomiar w terenie',
      'Operat dla urzędu',
      'Śledzenie pracy w urzędzie (do klauzuli map)',
      'Dokumentacja dla gminy do wydania decyzji',
      'Decyzja gminy',
      'Oddanie klientowi',
      'Zapłata',
    ]);
  });

  it('uses the upper bound of ranges from the handwritten notes', () => {
    const limit = (name: string) => podzial.steps.find((s) => s.name === name)?.limitDays;
    expect(limit('Ustalenie terminu pomiaru w terenie')).toBe(2);
    expect(limit('Wstępny projekt podziału')).toBe(5);
    expect(limit('Operat dla urzędu')).toBe(5);
  });

  it('marks only the assumed limits as provisional', () => {
    expect(podzial.steps.filter((s) => s.provisional).map((s) => s.name)).toEqual([
      'Decyzja gminy',
      'Oddanie klientowi',
      'Zapłata',
    ]);
  });

  it('names step kinds in Polish in error messages (Łukasz edits them himself)', () => {
    const payment = [
      { name: 'Zapłata', kind: 'own' as const, limitDays: 14, provisional: false, payment: true },
    ];
    expect(() => validateWorkType({ ...valid, steps: payment })).toThrow(/„Czekamy \(urząd \/ klient\)”/);
    const daily = [{ name: 'Kontrola', kind: 'daily' as const, limitDays: 3, provisional: false }];
    expect(() => validateWorkType({ ...valid, steps: daily })).toThrow(/„Sprawdzamy codziennie”/);
  });

  it('has a Polish label for every step kind', () => {
    expect(STEP_KINDS.map((k) => STEP_KIND_LABELS[k])).toEqual([
      'Robimy my',
      'Czekamy (urząd / klient)',
      'Sprawdzamy codziennie',
      'W ustalonym dniu (np. pomiar)',
    ]);
  });
});
