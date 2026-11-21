import type { AppDatabase } from '../../db.js';
import type { LocalDate } from '../urgency/day-counter.js';
import type { MessageSettings } from '../payments/payment-message.js';
import { requirePerson } from '../common/form-fields.js';

type MessageKey = keyof MessageSettings;

/** Pola w Ustawieniach: kolejność na ekranie i nazwa w historii. */
export const MESSAGE_FIELDS: readonly { key: MessageKey; label: string }[] = [
  { key: 'bankAccount', label: 'Numer konta' },
  { key: 'reviewLink', label: 'Link do opinii Google' },
];

export interface MessageSettingsHistoryEntry {
  happenedOn: LocalDate;
  person: string;
  label: string;
  oldValue: string;
  newValue: string;
}

const EMPTY: MessageSettings = { bankAccount: '', reviewLink: '' };

/** Numer konta i link do opinii do wiadomości SMS dla klienta, z historią „kto, co, kiedy”. */
export class MessageSettingsService {
  constructor(
    private readonly db: AppDatabase,
    private readonly today: () => LocalDate,
  ) {}

  get(): MessageSettings {
    const rows = this.db.connection.prepare('SELECT key, value FROM message_settings').all() as {
      key: string;
      value: string;
    }[];
    const result = { ...EMPTY };
    for (const row of rows) if (row.key in result) result[row.key as MessageKey] = row.value;
    return result;
  }

  /** Zapisuje oba pola z formularza; przy błędzie w którymkolwiek nie zapisuje niczego. */
  update(raw: Partial<Record<MessageKey, string>>, person: string): void {
    const who = requirePerson(person);
    const next: MessageSettings = {
      bankAccount: parseBankAccount(raw.bankAccount ?? ''),
      reviewLink: parseReviewLink(raw.reviewLink ?? ''),
    };
    const current = this.get();
    const upsert = this.db.connection.prepare(
      'INSERT INTO message_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    );
    const log = this.db.connection.prepare(
      'INSERT INTO message_settings_history (happened_on, person, key, old_value, new_value) VALUES (?, ?, ?, ?, ?)',
    );
    this.db.connection.transaction(() => {
      for (const { key } of MESSAGE_FIELDS) {
        if (current[key] === next[key]) continue;
        upsert.run(key, next[key]);
        log.run(this.today(), who, key, current[key], next[key]);
      }
    })();
  }

  /** Najnowsze zmiany na górze. */
  history(): MessageSettingsHistoryEntry[] {
    const rows = this.db.connection
      .prepare(
        'SELECT happened_on, person, key, old_value, new_value FROM message_settings_history ORDER BY id DESC',
      )
      .all() as { happened_on: string; person: string; key: string; old_value: string; new_value: string }[];
    return rows.map((r) => ({
      happenedOn: r.happened_on,
      person: r.person,
      label: MESSAGE_FIELDS.find((f) => f.key === r.key)?.label ?? r.key,
      oldValue: r.old_value,
      newValue: r.new_value,
    }));
  }
}

const ACCOUNT_DIGITS = 26;
const IBAN_COUNTRY_DIGITS = '2521'; // „PL” zamienione na cyfry (P=25, L=21) wg zasad IBAN
const IBAN_CHECK_MODULO = 97n;
const IBAN_CHECK_OK = 1n;
const GROUP = 4;

/**
 * Polski numer konta (26 cyfr, z „PL” lub bez, spacje i myślniki dowolnie).
 * Sprawdza cyfry kontrolne, więc wychwytuje literówki. Wynik: cyfry w grupach „12 3456 …”.
 */
export function parseBankAccount(text: string): string {
  const compact = text.replace(/[\s-]/g, '').replace(/^PL/i, '');
  if (compact === '') return '';
  if (!new RegExp(`^\\d{${ACCOUNT_DIGITS}}$`).test(compact)) throw new Error('Numer konta musi mieć 26 cyfr');
  const rearranged = compact.slice(2) + IBAN_COUNTRY_DIGITS + compact.slice(0, 2);
  if (BigInt(rearranged) % IBAN_CHECK_MODULO !== IBAN_CHECK_OK) {
    throw new Error('Numer konta jest niepoprawny (prawdopodobnie literówka), sprawdź cyfry');
  }
  return [compact.slice(0, 2), ...(compact.slice(2).match(new RegExp(`\\d{${GROUP}}`, 'g')) ?? [])].join(' ');
}

/** Link do wystawienia opinii: tylko https:// z adresem strony; pusty = brak zdania o opinii. */
export function parseReviewLink(text: string): string {
  const link = text.trim();
  if (link === '') return '';
  let url: URL | null = null;
  try {
    url = new URL(link);
  } catch {
    url = null;
  }
  if (url?.protocol !== 'https:' || url.hostname === '' || !link.toLowerCase().startsWith('https://')) {
    throw new Error('Link do opinii musi zaczynać się od https:// (skopiuj go z Google)');
  }
  return link;
}
