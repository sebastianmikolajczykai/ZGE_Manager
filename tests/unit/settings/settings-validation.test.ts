import { describe, it, expect } from 'vitest';
import { nearLimitNotice, validateSettingsForm } from '../../../src/modules/settings/settings-validation.js';

/** Formularz z ekranu Ustawień: wszystkie pola jako tekst, checkbox obecny tylko gdy zaznaczony. */
function form(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    yellowAfterIdleDays: '2',
    redAfterIdleDays: '3',
    warnDaysBeforeLimit: '1',
    blinkEnabled: '1',
    confirmActions: '1',
    blinkAfterRedDays: '7',
    offerFollowUpDays: '7',
    refreshSeconds: '60',
    ...overrides,
  };
}

describe('validateSettingsForm (reguły pól „Kolory i przypomnienia”)', () => {
  it('accepts the default form and turns it into settings', () => {
    const result = validateSettingsForm(form());
    expect(result.errors).toEqual({});
    expect(result.settings).toMatchObject({
      yellowAfterIdleDays: 2,
      redAfterIdleDays: 3,
      blinkEnabled: true,
    });
  });

  it('trims spaces around a number', () => {
    expect(validateSettingsForm(form({ offerFollowUpDays: ' 9 ' })).settings?.offerFollowUpDays).toBe(9);
  });

  it.each(['', '   ', 'dwa', '1.5', '2,5', '1e1', '-1', '+3', '0x2', '3 dni'])(
    'rejects "%s" as not a whole number, with the allowed range in the message',
    (typed) => {
      const result = validateSettingsForm(form({ offerFollowUpDays: typed }));
      expect(result.settings).toBeNull();
      expect(result.errors.offerFollowUpDays).toBe('Wpisz liczbę całkowitą od 1 do 60.');
    },
  );

  it.each([
    ['yellowAfterIdleDays', '0', 'od 1 do 30'],
    ['yellowAfterIdleDays', '31', 'od 1 do 30'],
    ['redAfterIdleDays', '61', 'od 1 do 60'],
    ['warnDaysBeforeLimit', '11', 'od 0 do 10'],
    ['blinkAfterRedDays', '0', 'od 1 do 60'],
    ['offerFollowUpDays', '0', 'od 1 do 60'],
    ['refreshSeconds', '14', 'od 15 do 600'],
    ['refreshSeconds', '601', 'od 15 do 600'],
  ])('rejects %s = %s (outside %s)', (key, typed, range) => {
    const result = validateSettingsForm(form({ [key]: typed }));
    expect(result.errors[key as keyof typeof result.errors]).toContain(range);
  });

  it.each([
    ['yellowAfterIdleDays', '1'],
    ['yellowAfterIdleDays', '30'],
    ['warnDaysBeforeLimit', '0'],
    ['warnDaysBeforeLimit', '10'],
    ['refreshSeconds', '15'],
    ['refreshSeconds', '600'],
  ])('accepts the boundary value %s = %s', (key, typed) => {
    const overrides: Record<string, string> = { [key]: typed };
    if (key === 'yellowAfterIdleDays') overrides.redAfterIdleDays = String(Number(typed) + 1);
    expect(validateSettingsForm(form(overrides)).errors).toEqual({});
  });

  it('0 in "Żółte przed limitem" switches the warning off (allowed)', () => {
    expect(validateSettingsForm(form({ warnDaysBeforeLimit: '0' })).settings?.warnDaysBeforeLimit).toBe(0);
  });

  it.each([
    ['3', '3'],
    ['5', '4'],
    ['30', '1'],
  ])('red must come after yellow: yellow %s, red %s is refused at the red field', (yellow, red) => {
    const result = validateSettingsForm(form({ yellowAfterIdleDays: yellow, redAfterIdleDays: red }));
    expect(result.settings).toBeNull();
    expect(result.errors.redAfterIdleDays).toBe(
      `Czerwone musi przyjść później niż żółte: wpisz co najmniej ${Number(yellow) + 1}.`,
    );
    expect(result.errors.yellowAfterIdleDays).toBeUndefined();
  });

  it('red one day after yellow is fine (30 → 31)', () => {
    expect(validateSettingsForm(form({ yellowAfterIdleDays: '30', redAfterIdleDays: '31' })).errors).toEqual(
      {},
    );
  });

  it('does not compare yellow and red when one of them is not a number (one message per field)', () => {
    const result = validateSettingsForm(form({ yellowAfterIdleDays: 'x', redAfterIdleDays: '1' }));
    expect(result.errors.yellowAfterIdleDays).toContain('liczbę całkowitą');
    expect(result.errors.redAfterIdleDays).toBeUndefined();
  });

  it('shows every wrong field at once', () => {
    const result = validateSettingsForm(
      form({ offerFollowUpDays: '', refreshSeconds: '5', redAfterIdleDays: '1' }),
    );
    expect(Object.keys(result.errors).sort()).toEqual([
      'offerFollowUpDays',
      'redAfterIdleDays',
      'refreshSeconds',
    ]);
  });

  it('blink days must still be valid while blinking is switched off (so switching it on makes sense)', () => {
    const withoutBlink = form({ blinkAfterRedDays: '0' });
    delete withoutBlink.blinkEnabled;
    expect(validateSettingsForm(withoutBlink).errors.blinkAfterRedDays).toContain('od 1 do 60');
  });

  it('an unticked checkbox means "off", a ticked one "on"', () => {
    const raw = form();
    delete raw.confirmActions;
    const settings = validateSettingsForm(raw).settings;
    expect(settings?.confirmActions).toBe(false);
    expect(settings?.blinkEnabled).toBe(true);
  });
});

describe('nearLimitNotice (uwaga przy „Żółte przed limitem”, zapis dozwolony)', () => {
  const steps = [
    { name: 'Pomiar', kind: 'scheduled' as const, limitDays: 1 },
    { name: 'Mapa', kind: 'own' as const, limitDays: 5 },
    { name: 'Oddanie', kind: 'own' as const, limitDays: 2 },
    { name: 'Urząd', kind: 'waiting' as const, limitDays: 30 },
    { name: 'Notatka', kind: 'own' as const, limitDays: null },
  ];

  it('no notice when the warning is off (0) or shorter than every step limit', () => {
    expect(nearLimitNotice(0, steps)).toBeNull();
    expect(nearLimitNotice(1, steps)).toBeNull();
  });

  it('warns when the warning equals the shortest limit, naming the shortest step', () => {
    expect(nearLimitNotice(2, steps)).toBe(
      'Uwaga: kroki z limitem do 2 dni (np. „Oddanie”) będą żółte już od pierwszego dnia.',
    );
  });

  it('counts waiting steps too, but ignores scheduled/daily steps and steps without a limit', () => {
    expect(nearLimitNotice(10, steps)).toContain('do 10 dni (np. „Oddanie”)');
    expect(nearLimitNotice(4, [{ name: 'Pomiar', kind: 'scheduled', limitDays: 1 }])).toBeNull();
  });
});
