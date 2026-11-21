import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { AppDatabase } from '../../../src/db.js';
import {
  SettingsService,
  SettingsValidationError,
  DEFAULT_APP_SETTINGS,
} from '../../../src/modules/settings/settings-service.js';
import { DaysOffRepository } from '../../../src/modules/settings/days-off-repository.js';

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

describe('SettingsService (Ustawienia: kolory i przypomnienia)', () => {
  let dir: string;
  let db: AppDatabase;
  let settings: SettingsService;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'zge-'));
    db = AppDatabase.open(path.join(dir, 'zge.db'));
    db.migrate();
    settings = new SettingsService(db, () => '2026-11-20');
  });

  afterEach(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('starts with the agreed defaults (2 / 3 days, warning 1 day before limit, blink after 7, offer 7, refresh 60 s)', () => {
    expect(settings.get()).toEqual(DEFAULT_APP_SETTINGS);
    expect(DEFAULT_APP_SETTINGS).toEqual({
      yellowAfterIdleDays: 2,
      redAfterIdleDays: 3,
      warnDaysBeforeLimit: 1,
      blinkEnabled: true,
      blinkAfterRedDays: 7,
      offerFollowUpDays: 7,
      refreshSeconds: 60,
      confirmActions: true,
    });
  });

  it('can switch off the "Czy na pewno?" question and logs it as words', () => {
    const withoutConfirm = form({});
    delete withoutConfirm.confirmActions;
    settings.update(withoutConfirm, 'Łukasz');
    expect(settings.get().confirmActions).toBe(false);
    expect(settings.history()[0]).toMatchObject({
      label: 'Pytaj „Czy na pewno?” po kliknięciu osoby',
      oldValue: 'tak',
      newValue: 'nie',
    });
  });

  it('saves new values and keeps them after reopening the database', () => {
    settings.update(form({ redAfterIdleDays: '4', offerFollowUpDays: '10' }), 'Łukasz');
    db.close();
    db = AppDatabase.open(path.join(dir, 'zge.db'));
    const reopened = new SettingsService(db, () => '2026-11-20');
    expect(reopened.get()).toMatchObject({
      redAfterIdleDays: 4,
      offerFollowUpDays: 10,
      yellowAfterIdleDays: 2,
    });
  });

  it('an unticked checkbox switches blinking off', () => {
    const withoutBlink = form();
    delete withoutBlink.blinkEnabled;
    settings.update(withoutBlink, 'Łukasz');
    expect(settings.get().blinkEnabled).toBe(false);
  });

  it('logs who changed what, only for values that really changed', () => {
    settings.update(form({ redAfterIdleDays: '4' }), 'Łukasz');
    settings.update(form({ redAfterIdleDays: '4' }), 'Bartek');
    expect(settings.history()).toEqual([
      {
        happenedOn: '2026-11-20',
        person: 'Łukasz',
        label: 'Czerwone, gdy brak ruchu przez',
        oldValue: '3',
        newValue: '4',
      },
    ]);
  });

  it('shows blinking changes in the log as words', () => {
    const withoutBlink = form();
    delete withoutBlink.blinkEnabled;
    settings.update(withoutBlink, 'Marcelina');
    expect(settings.history()[0]).toMatchObject({ oldValue: 'tak', newValue: 'nie' });
  });

  it.each([
    [{ redAfterIdleDays: '2' }, /później niż żółte/],
    [{ yellowAfterIdleDays: 'dwa' }, /liczbę całkowitą/],
    [{ yellowAfterIdleDays: '1.5' }, /liczbę całkowitą/],
    [{ yellowAfterIdleDays: '' }, /liczbę całkowitą/],
    [{ warnDaysBeforeLimit: '-1' }, /od 0 do 10/],
    [{ yellowAfterIdleDays: '1e1' }, /liczbę całkowitą/],
    [{ refreshSeconds: '5' }, /od 15 do 600/],
    [{ offerFollowUpDays: '0' }, /od 1 do 60/],
  ])('rejects %o with a readable message and saves nothing', (change, error) => {
    expect(() => settings.update(form(change), 'Łukasz')).toThrow(error);
    expect(settings.get()).toEqual(DEFAULT_APP_SETTINGS);
    expect(settings.history()).toEqual([]);
  });

  it('tells how many values were really saved (0 when nothing changed)', () => {
    expect(settings.update(form({ redAfterIdleDays: '4', refreshSeconds: '90' }), 'Łukasz')).toBe(2);
    expect(settings.update(form({ redAfterIdleDays: '4', refreshSeconds: '90' }), 'Łukasz')).toBe(0);
    expect(settings.resetToDefaults('Bartek')).toBe(2);
  });

  it('a wrong form gives one message per wrong field and saves nothing', () => {
    let caught: unknown;
    try {
      settings.update(
        form({ yellowAfterIdleDays: '4', redAfterIdleDays: '4', refreshSeconds: 'x' }),
        'Łukasz',
      );
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(SettingsValidationError);
    expect((caught as SettingsValidationError).fieldErrors).toEqual({
      redAfterIdleDays: 'Czerwone musi przyjść później niż żółte: wpisz co najmniej 5.',
      refreshSeconds: 'Wpisz liczbę całkowitą od 15 do 600.',
    });
    expect(settings.get()).toEqual(DEFAULT_APP_SETTINGS);
    expect(settings.history()).toEqual([]);
  });

  it('requires choosing who makes the change', () => {
    expect(() => settings.update(form({ redAfterIdleDays: '5' }), ' ')).toThrow(/Wybierz/);
  });

  it('restores defaults and logs what was put back', () => {
    settings.update(form({ redAfterIdleDays: '5', refreshSeconds: '120' }), 'Łukasz');
    settings.resetToDefaults('Bartek');
    expect(settings.get()).toEqual(DEFAULT_APP_SETTINGS);
    expect(settings.history().slice(0, 2)).toEqual([
      {
        happenedOn: '2026-11-20',
        person: 'Bartek',
        label: 'Odświeżanie ekranu co (sekund)',
        oldValue: '120',
        newValue: '60',
      },
      {
        happenedOn: '2026-11-20',
        person: 'Bartek',
        label: 'Czerwone, gdy brak ruchu przez',
        oldValue: '5',
        newValue: '3',
      },
    ]);
  });

  it('gives the colour rules their part of the settings', () => {
    settings.update(
      form({ yellowAfterIdleDays: '3', redAfterIdleDays: '5', warnDaysBeforeLimit: '2' }),
      'Łukasz',
    );
    expect(settings.urgency()).toMatchObject({
      yellowAfterIdleDays: 3,
      redAfterIdleDays: 5,
      warnDaysBeforeLimit: 2,
      blinkEnabled: true,
      blinkAfterRedDays: 7,
      dayMode: 'working',
    });
  });

  it('passes company days off to the colour rules', () => {
    new DaysOffRepository(db).add({ fromOn: '2026-12-28', toOn: '', note: null }, 'Łukasz');
    const isDayOff = settings.urgency().isDayOff;
    expect(isDayOff?.('2026-12-28')).toBe(true);
    expect(isDayOff?.('2026-12-29')).toBe(false);
  });
});
