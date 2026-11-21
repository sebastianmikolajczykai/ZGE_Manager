import {
  DEFAULT_APP_SETTINGS,
  SETTING_FIELDS,
  type AppSettings,
  type SettingField,
  type SettingKey,
} from './settings-fields.js';
import type { StepKind } from '../work-types/work-type-definition.js';

/**
 * Sprawdzanie formularza „Kolory i przypomnienia”. Niczego nie poprawia po cichu:
 * każde złe pole dostaje własny komunikat, a ustawienia są zwracane tylko wtedy, gdy wszystko jest poprawne.
 */

/** Komunikat błędu przy konkretnym polu (klucz = nazwa pola). */
export type SettingErrors = Partial<Record<SettingKey, string>>;

export interface SettingsValidation {
  /** null, gdy jest choć jeden błąd. */
  settings: AppSettings | null;
  errors: SettingErrors;
}

/** Tylko cyfry: bez minusa, plusa, przecinka, kropki i zapisu typu „1e1”. */
const WHOLE_NUMBER = /^\d+$/;

export function validateSettingsForm(raw: Record<string, string>): SettingsValidation {
  const result: AppSettings = { ...DEFAULT_APP_SETTINGS };
  const errors: SettingErrors = {};
  for (const field of SETTING_FIELDS) {
    if (field.type === 'switch') {
      setSwitch(result, field.key, Boolean(raw[field.key]));
      continue;
    }
    const value = parseWholeNumber(field, raw[field.key] ?? '');
    if (value === null) errors[field.key] = rangeMessage(field);
    else setNumber(result, field.key, value);
  }
  checkRedAfterYellow(result, errors);
  return { settings: Object.keys(errors).length === 0 ? result : null, errors };
}

function parseWholeNumber(field: SettingField, text: string): number | null {
  const trimmed = text.trim();
  if (!WHOLE_NUMBER.test(trimmed)) return null;
  const value = Number(trimmed);
  return value >= field.min && value <= field.max ? value : null;
}

function rangeMessage(field: SettingField): string {
  return `Wpisz liczbę całkowitą od ${field.min} do ${field.max}.`;
}

/** Przy równych progach żółte nigdy by się nie pokazało, więc czerwone musi być co najmniej o 1 dzień później. */
function checkRedAfterYellow(settings: AppSettings, errors: SettingErrors): void {
  if (errors.yellowAfterIdleDays || errors.redAfterIdleDays) return;
  if (settings.redAfterIdleDays > settings.yellowAfterIdleDays) return;
  errors.redAfterIdleDays = `Czerwone musi przyjść później niż żółte: wpisz co najmniej ${settings.yellowAfterIdleDays + 1}.`;
}

function setSwitch(target: AppSettings, key: SettingKey, on: boolean): void {
  if (key === 'blinkEnabled' || key === 'confirmActions') target[key] = on;
}

function setNumber(target: AppSettings, key: SettingKey, value: number): void {
  if (key !== 'blinkEnabled' && key !== 'confirmActions') target[key] = value;
}

/** Krok rodzaju pracy w takim zakresie, jaki jest potrzebny do uwagi o limicie. */
export interface LimitedStep {
  name: string;
  kind: StepKind;
  limitDays: number | null;
}

/** Ostrzeżenie przed limitem dotyczy tylko kroków liczonych od startu (nasze i czekanie na urząd). */
const KINDS_WITH_LIMIT: readonly StepKind[] = ['own', 'waiting'];

/**
 * Uwaga (nie błąd): gdy „Żółte przed limitem” ≥ limit kroku, taki krok jest żółty od pierwszego dnia.
 * Decyzja Sebastiana 21.11: zapis dozwolony, ale pokazujemy skutek. null = brak uwagi.
 */
export function nearLimitNotice(warnDaysBeforeLimit: number, steps: readonly LimitedStep[]): string | null {
  if (warnDaysBeforeLimit === 0) return null;
  const affected = steps.filter(
    (s) => KINDS_WITH_LIMIT.includes(s.kind) && s.limitDays !== null && s.limitDays <= warnDaysBeforeLimit,
  );
  const shortest = [...affected].sort((a, b) => (a.limitDays ?? 0) - (b.limitDays ?? 0))[0];
  if (!shortest) return null;
  return `Uwaga: kroki z limitem do ${warnDaysBeforeLimit} dni (np. „${shortest.name}”) będą żółte już od pierwszego dnia.`;
}
