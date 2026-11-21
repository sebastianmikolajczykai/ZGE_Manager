/** Ustawienia, które Łukasz zmienia sam na ekranie Ustawienia. */
export interface AppSettings {
  yellowAfterIdleDays: number;
  redAfterIdleDays: number;
  warnDaysBeforeLimit: number;
  blinkEnabled: boolean;
  blinkAfterRedDays: number;
  offerFollowUpDays: number;
  refreshSeconds: number;
  /** Okienko „Czy na pewno?” po kliknięciu osoby na karcie (zlecenie, oferta, zapłata). */
  confirmActions: boolean;
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
  confirmActions: true,
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
  {
    key: 'confirmActions',
    label: 'Pytaj „Czy na pewno?” po kliknięciu osoby',
    hint: 'np. „Zapłacone: Bartek” trzeba potwierdzić drugim kliknięciem',
    type: 'switch',
    min: 0,
    max: 1,
  },
];
