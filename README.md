# ZGE: lista zleceń (MVP)

Żywa lista zleceń dla firmy geodezyjnej ZGE: kroki na rodzaj pracy, limity dni, kolory pilności, oferty i płatności.

## Uruchomienie lokalne

```bash
npm ci
cp .env.example .env   # ustaw DATABASE_URL
npm start
```

## Testy (piramida)

| Poziom | Polecenie | Co sprawdza |
|---|---|---|
| Unit | `npm run test:unit` | Czyste reguły (konfiguracja, pilność, kolory), bez bazy |
| Integracja | `npm run test:integration` | Aplikacja + prawdziwy Postgres (`TEST_DATABASE_URL`) |
| E2E | `npm run test:e2e` | Prawdziwa przeglądarka (Playwright) na uruchomionym serwerze |
| Wszystko | `npm test` | Typecheck + wszystkie poziomy |

Praca w rytmie TDD: najpierw test, który nie przechodzi (red), potem minimalny kod (green), potem porządki (refactor).
CI (GitHub Actions) uruchamia całość przy każdej zmianie.
