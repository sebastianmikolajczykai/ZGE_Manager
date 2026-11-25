import type { WorkTypeDefinition } from './work-type-definition.js';

/**
 * Szablony wgrywane przy pierwszym uruchomieniu.
 * Podział: kroki z odręcznej kartki klienta (19.11.2026); przy zakresach („1–2 dni”) górna granica.
 * Kroki 7, 11–13 dołożone w uzgodnieniu z Sebastianem; limity oznaczone provisional = do potwierdzenia.
 */
export const DEFAULT_WORK_TYPES: readonly WorkTypeDefinition[] = [
  {
    name: 'Podział nieruchomości',
    steps: [
      { name: 'Ustalenie terminu pomiaru w terenie', kind: 'own', limitDays: 2, provisional: false },
      // Kartka: „Ia”, 1–2 dni; rozmowa 24.11: robione w tym samym czasie co krok 1 (Łukasz termin, Bartek analiza).
      {
        name: 'Analiza materiałów w urzędzie',
        kind: 'own',
        limitDays: 2,
        provisional: false,
        parallel: true,
      },
      { name: 'Wysłanie zawiadomień', kind: 'own', limitDays: 2, provisional: false },
      { name: 'Wstępny projekt podziału', kind: 'own', limitDays: 5, provisional: false },
      { name: 'Śledzenie zawiadomień (Poczta Polska)', kind: 'daily', limitDays: null, provisional: false },
      { name: 'Protokoły i przygotowanie do wyjazdu w teren', kind: 'own', limitDays: 2, provisional: false },
      { name: 'Pomiar w terenie', kind: 'scheduled', limitDays: null, provisional: false },
      { name: 'Operat dla urzędu', kind: 'own', limitDays: 5, provisional: false },
      {
        name: 'Śledzenie pracy w urzędzie (do klauzuli map)',
        kind: 'daily',
        limitDays: null,
        provisional: false,
      },
      { name: 'Dokumentacja dla gminy do wydania decyzji', kind: 'own', limitDays: 2, provisional: false },
      { name: 'Decyzja gminy', kind: 'waiting', limitDays: 30, provisional: true },
      { name: 'Oddanie klientowi', kind: 'own', limitDays: 2, provisional: true },
      { name: 'Zapłata', kind: 'waiting', limitDays: 14, provisional: true, payment: true },
    ],
  },
];
