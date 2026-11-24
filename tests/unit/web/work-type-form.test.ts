import { describe, it, expect } from 'vitest';
import {
  applyOp,
  definitionFromDraft,
  draftFromForm,
  draftFromWorkType,
  emptyDraft,
  type WorkTypeDraft,
} from '../../../src/web/work-type-form.js';

const draft: WorkTypeDraft = {
  name: 'Mapa',
  steps: [
    { name: 'A', kind: 'own', limit: '2', payment: false, parallel: false },
    { name: 'B', kind: 'waiting', limit: '', payment: false, parallel: false },
    { name: 'C', kind: 'waiting', limit: '14', payment: true, parallel: false },
  ],
};

describe('formularz rodzaju pracy (edytor kroków)', () => {
  it('reads the editor form fields', () => {
    const form = {
      workTypeName: ' Mapa ',
      stepCount: '2',
      stepName_1: 'A',
      stepKind_1: 'own',
      stepLimit_1: '2',
      stepName_2: 'Zapłata',
      stepKind_2: 'waiting',
      stepLimit_2: '14',
      payment: '2',
    };
    expect(draftFromForm(form)).toEqual({
      name: ' Mapa ',
      steps: [
        { name: 'A', kind: 'own', limit: '2', payment: false, parallel: false },
        { name: 'Zapłata', kind: 'waiting', limit: '14', payment: true, parallel: false },
      ],
    });
  });

  it('turns a saved work type into a draft and back', () => {
    const def = {
      id: 1,
      name: 'Mapa',
      hidden: false,
      steps: [
        {
          position: 1,
          name: 'A',
          kind: 'own' as const,
          limitDays: 2,
          provisional: true,
          payment: false,
          parallel: false,
        },
      ],
    };
    expect(draftFromWorkType(def)).toEqual({
      name: 'Mapa',
      steps: [{ name: 'A', kind: 'own', limit: '2', payment: false, parallel: false }],
    });
  });

  it('starts a new work type with one empty step', () => {
    expect(emptyDraft()).toEqual({
      name: '',
      steps: [{ name: '', kind: 'own', limit: '2', payment: false, parallel: false }],
    });
  });

  it.each([
    ['add', ['A', 'B', 'C', '']],
    ['up:2', ['B', 'A', 'C']],
    ['down:2', ['A', 'C', 'B']],
    ['up:1', ['A', 'B', 'C']],
    ['down:3', ['A', 'B', 'C']],
    ['remove:2', ['A', 'C']],
    ['nonsense', ['A', 'B', 'C']],
  ])('operation %s gives steps %o', (op, names) => {
    expect(applyOp(draft, op).steps.map((s) => s.name)).toEqual(names);
  });

  it('saving confirms limits (no "do potwierdzenia") and turns an empty limit into "no limit"', () => {
    expect(definitionFromDraft(draft)).toEqual({
      name: 'Mapa',
      steps: [
        { name: 'A', kind: 'own', limitDays: 2, provisional: false, payment: false, parallel: false },
        { name: 'B', kind: 'waiting', limitDays: null, provisional: false, payment: false, parallel: false },
        { name: 'C', kind: 'waiting', limitDays: 14, provisional: false, payment: true, parallel: false },
      ],
    });
  });

  it('ignores a limit typed for "daily" or "scheduled" steps (they have no limit)', () => {
    const def = definitionFromDraft({
      name: 'X',
      steps: [{ name: 'D', kind: 'daily', limit: '3', payment: false, parallel: false }],
    });
    expect(def.steps[0]?.limitDays).toBeNull();
  });

  it.each(['dwa', '1.5', '0', '-3'])('rejects the limit "%s" with a readable message', (limit) => {
    const bad = {
      name: 'X',
      steps: [{ name: 'Krok', kind: 'own' as const, limit, payment: false, parallel: false }],
    };
    expect(() => definitionFromDraft(bad)).toThrow(/Krok 1 \(„Krok”\): limit/);
  });

  it('reads the "w tym samym czasie co poprzedni" checkbox for each step', () => {
    const form = {
      workTypeName: 'Podział',
      stepCount: '2',
      stepName_1: 'Termin',
      stepKind_1: 'own',
      stepLimit_1: '2',
      stepName_2: 'Analiza',
      stepKind_2: 'own',
      stepLimit_2: '2',
      stepParallel_2: '1',
    };
    expect(draftFromForm(form).steps.map((s) => s.parallel)).toEqual([false, true]);
  });

  it('keeps the parallel mark when a saved work type becomes a draft and is saved again', () => {
    const saved = {
      id: 1,
      name: 'Podział',
      hidden: false,
      steps: [
        {
          position: 1,
          name: 'A',
          kind: 'own' as const,
          limitDays: 2,
          provisional: false,
          payment: false,
          parallel: false,
        },
        {
          position: 2,
          name: 'B',
          kind: 'own' as const,
          limitDays: 2,
          provisional: false,
          payment: false,
          parallel: true,
        },
      ],
    };
    const def = definitionFromDraft(draftFromWorkType(saved));
    expect(def.steps.map((s) => s.parallel)).toEqual([false, true]);
  });

  it('the first step can never be parallel (a step moved to the top loses the mark)', () => {
    const moved = applyOp(
      {
        name: 'X',
        steps: [
          { name: 'A', kind: 'own', limit: '2', payment: false, parallel: false },
          { name: 'B', kind: 'own', limit: '2', payment: false, parallel: true },
        ],
      },
      'up:2',
    );
    expect(definitionFromDraft(moved).steps.map((s) => [s.name, s.parallel])).toEqual([
      ['B', false],
      ['A', false],
    ]);
  });
});
