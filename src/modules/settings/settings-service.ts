import type { AppDatabase } from '../../db.js';
import type { LocalDate } from '../urgency/day-counter.js';
import type { UrgencySettings } from '../urgency/urgency-rules.js';
import { requirePerson } from '../common/form-fields.js';

/** Ustawienia, które Łukasz zmienia sam na ekranie Ustawienia. */
export interface AppSettings {
  yellowAfterIdleDays: number;
  redAfterIdleDays: number;
  warnDaysBeforeLimit: number;
  blinkEnabled: boolean;
  blinkAfterRedDays: number;
  offerFollowUpDays: number;
  refreshSeconds: number;
}

export type SettingKey = keyof AppSettings;

export const DEFAULT_APP_SETTINGS: AppSettings = {
  yellowAfterIdleDays: 2,
  redAfterIdleDays: 3,
  warnDaysBeforeLimit: 1,
  blinkEnabled: true,
  blinkAfterRedDays: 7,
  offerFollowUpDays: 7,
  refreshSeconds: 60,
};

/** Opis pola: etykieta na ekranie i w historii, dozwolony zakres (dla liczb). */
export interface SettingField {
  key: SettingKey;
  label: string;
  hint: string;
  type: 'number' | 'switch';
  min: number;
  max: number;
}

export const SETTING_FIELDS: readonly SettingField[] = [
  {
    key: 'yellowAfterIdleDays',
    label: 'Żółte, gdy brak ruchu przez',
    hint: 'dni roboczych',
    type: 'number',
    min: 1,
    max: 30,
  },
  {
    key: 'redAfterIdleDays',
    label: 'Czerwone, gdy brak ruchu przez',
    hint: 'dni roboczych',
    type: 'number',
    min: 1,
    max: 60,
  },
  {
    key: 'warnDaysBeforeLimit',
    label: 'Żółte przed limitem kroku',
    hint: 'dni wcześniej (0 = bez ostrzeżenia)',
    type: 'number',
    min: 0,
    max: 10,
  },
  { key: 'blinkEnabled', label: 'Miganie włączone', hint: '', type: 'switch', min: 0, max: 1 },
  {
    key: 'blinkAfterRedDays',
    label: 'Miganie po tylu dniach na czerwono',
    hint: 'dni roboczych',
    type: 'number',
    min: 1,
    max: 60,
  },
  {
    key: 'offerFollowUpDays',
    label: 'Przypomnienie o ofercie po',
    hint: 'dni roboczych',
    type: 'number',
    min: 1,
    max: 60,
  },
  {
    key: 'refreshSeconds',
    label: 'Odświeżanie ekranu co (sekund)',
    hint: 'od 15 do 600',
    type: 'number',
    min: 15,
    max: 600,
  },
];

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
  constructor(
    private readonly db: AppDatabase,
    private readonly today: () => LocalDate,
  ) {}

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

  /** Zapisuje wartości z formularza. Przy błędzie nie zapisuje niczego. */
  update(raw: Record<string, string>, person: string): void {
    const who = requirePerson(person);
    this.save(parseForm(raw), who);
  }

  resetToDefaults(person: string): void {
    this.save(DEFAULT_APP_SETTINGS, requirePerson(person));
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

  /** Część ustawień potrzebna do liczenia kolorów. */
  urgency(): UrgencySettings {
    const s = this.get();
    return {
      yellowAfterIdleDays: s.yellowAfterIdleDays,
      redAfterIdleDays: s.redAfterIdleDays,
      warnDaysBeforeLimit: s.warnDaysBeforeLimit,
      blinkEnabled: s.blinkEnabled,
      blinkAfterRedDays: s.blinkAfterRedDays,
      dayMode: 'working',
    };
  }

  private save(next: AppSettings, person: string): void {
    const current = this.get();
    const upsert = this.db.connection.prepare(
      'INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    );
    const log = this.db.connection.prepare(
      'INSERT INTO settings_history (happened_on, person, key, old_value, new_value) VALUES (?, ?, ?, ?, ?)',
    );
    this.db.connection.transaction(() => {
      for (const field of SETTING_FIELDS) {
        const before = toNumber(current[field.key]);
        const after = toNumber(next[field.key]);
        if (before === after) continue;
        upsert.run(field.key, after);
        log.run(this.today(), person, field.key, before, after);
      }
    })();
  }
}

function parseForm(raw: Record<string, string>): AppSettings {
  const result = { ...DEFAULT_APP_SETTINGS };
  for (const field of SETTING_FIELDS) {
    if (field.type === 'switch') {
      setValue(result, field, raw[field.key] ? SWITCH_ON : SWITCH_OFF);
      continue;
    }
    setValue(result, field, parseNumber(field, raw[field.key] ?? ''));
  }
  if (result.redAfterIdleDays <= result.yellowAfterIdleDays) {
    throw new Error('Czerwone musi przyjść później niż żółte (więcej dni bez ruchu)');
  }
  return result;
}

function parseNumber(field: SettingField, text: string): number {
  const trimmed = text.trim();
  const value = Number(trimmed);
  if (trimmed === '' || !Number.isInteger(value) || value < field.min || value > field.max) {
    throw new Error(`„${field.label}” musi być liczbą całkowitą od ${field.min} do ${field.max}`);
  }
  return value;
}

function setValue(target: AppSettings, field: SettingField, value: number): void {
  if (field.key === 'blinkEnabled') target.blinkEnabled = value === SWITCH_ON;
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
