import type { AppDatabase } from '../../db.js';
import type { LocalDate } from '../urgency/day-counter.js';
import type { UrgencySettings } from '../urgency/urgency-rules.js';
import { requirePerson } from '../common/form-fields.js';
import { DaysOffRepository } from './days-off-repository.js';

import {
  DEFAULT_APP_SETTINGS,
  SETTING_FIELDS,
  type AppSettings,
  type SettingField,
} from './settings-fields.js';
import { validateSettingsForm, type SettingErrors } from './settings-validation.js';

export type { SettingErrors } from './settings-validation.js';
export {
  DEFAULT_APP_SETTINGS,
  SETTING_FIELDS,
  type AppSettings,
  type SettingField,
  type SettingKey,
} from './settings-fields.js';

export interface SettingsHistoryEntry {
  happenedOn: LocalDate;
  person: string;
  label: string;
  oldValue: string;
  newValue: string;
}

const SWITCH_ON = 1;
const SWITCH_OFF = 0;

/** Odczyt i zapis ustawień w bazie, z historią zmian „kto, co, kiedy”. */
export class SettingsService {
  private readonly daysOff: DaysOffRepository;

  constructor(
    private readonly db: AppDatabase,
    private readonly today: () => LocalDate,
  ) {
    this.daysOff = new DaysOffRepository(db);
  }

  get(): AppSettings {
    const rows = this.db.connection.prepare('SELECT key, value FROM app_settings').all() as {
      key: string;
      value: number;
    }[];
    const stored = new Map(rows.map((r) => [r.key, r.value]));
    const result = { ...DEFAULT_APP_SETTINGS };
    for (const field of SETTING_FIELDS) {
      const value = stored.get(field.key);
      if (value !== undefined) setValue(result, field, value);
    }
    return result;
  }

  /**
   * Zapisuje wartości z formularza i zwraca, ile z nich naprawdę się zmieniło.
   * Przy błędzie nie zapisuje niczego i rzuca SettingsValidationError z komunikatem przy każdym złym polu.
   */
  update(raw: Record<string, string>, person: string): number {
    const who = requirePerson(person);
    const { settings, errors } = validateSettingsForm(raw);
    if (!settings) throw new SettingsValidationError(errors);
    return this.save(settings, who);
  }

  /** Przywraca wartości domyślne; zwraca liczbę zmienionych pól. */
  resetToDefaults(person: string): number {
    return this.save(DEFAULT_APP_SETTINGS, requirePerson(person));
  }

  /** Najnowsze zmiany na górze. */
  history(): SettingsHistoryEntry[] {
    const rows = this.db.connection
      .prepare('SELECT happened_on, person, key, old_value, new_value FROM settings_history ORDER BY id DESC')
      .all() as { happened_on: string; person: string; key: string; old_value: number; new_value: number }[];
    return rows.map((r) => {
      const field = fieldOf(r.key);
      return {
        happenedOn: r.happened_on,
        person: r.person,
        label: field.label,
        oldValue: display(field, r.old_value),
        newValue: display(field, r.new_value),
      };
    });
  }

  /** Część ustawień potrzebna do liczenia kolorów (z dniami wolnymi firmy). */
  urgency(): UrgencySettings {
    const s = this.get();
    return {
      yellowAfterIdleDays: s.yellowAfterIdleDays,
      redAfterIdleDays: s.redAfterIdleDays,
      warnDaysBeforeLimit: s.warnDaysBeforeLimit,
      blinkEnabled: s.blinkEnabled,
      blinkAfterRedDays: s.blinkAfterRedDays,
      dayMode: 'working',
      isDayOff: this.daysOff.checker(),
    };
  }

  private save(next: AppSettings, person: string): number {
    const current = this.get();
    const upsert = this.db.connection.prepare(
      'INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    );
    const log = this.db.connection.prepare(
      'INSERT INTO settings_history (happened_on, person, key, old_value, new_value) VALUES (?, ?, ?, ?, ?)',
    );
    let changed = 0;
    this.db.connection.transaction(() => {
      for (const field of SETTING_FIELDS) {
        const before = toNumber(current[field.key]);
        const after = toNumber(next[field.key]);
        if (before === after) continue;
        upsert.run(field.key, after);
        log.run(this.today(), person, field.key, before, after);
        changed += 1;
      }
    })();
    return changed;
  }
}

/** Błędne pola formularza ustawień: komunikat przy każdym polu, w `message` wszystkie naraz. */
export class SettingsValidationError extends Error {
  constructor(readonly fieldErrors: SettingErrors) {
    super(Object.values(fieldErrors).join(' '));
    this.name = 'SettingsValidationError';
  }
}

function setValue(target: AppSettings, field: SettingField, value: number): void {
  if (field.key === 'blinkEnabled' || field.key === 'confirmActions') target[field.key] = value === SWITCH_ON;
  else target[field.key] = value;
}

function toNumber(value: number | boolean): number {
  if (typeof value === 'boolean') return value ? SWITCH_ON : SWITCH_OFF;
  return value;
}

function display(field: SettingField, value: number): string {
  if (field.type === 'switch') return value === SWITCH_ON ? 'tak' : 'nie';
  return String(value);
}

function fieldOf(key: string): SettingField {
  const field = SETTING_FIELDS.find((f) => f.key === key);
  if (!field) throw new Error(`Nieznane ustawienie w bazie: ${key}`);
  return field;
}
