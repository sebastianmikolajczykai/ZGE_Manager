# ZGE Menedżer (MVP)

Żywa lista zleceń dla firmy geodezyjnej ZGE: kroki na rodzaj pracy, limity dni, kolory pilności, oferty i płatności.

## Zasada: dane zostają na komputerze

Aplikacja działa na komputerze firmy i otwiera się w przeglądarce pod `http://localhost:3000`.
Dane są w jednym pliku SQLite (`dane/zge.db`), serwer nasłuchuje tylko na `127.0.0.1`, więc nic nie wychodzi do internetu.

## Uruchomienie lokalne

```bash
npm ci
cp .env.example .env   # opcjonalnie: DB_PATH, PORT
npm start
```

## Testy (piramida)

| Poziom     | Polecenie                  | Co sprawdza                                                  |
| ---------- | -------------------------- | ------------------------------------------------------------ |
| Unit       | `npm run test:unit`        | Czyste reguły (konfiguracja, pilność, kolory), bez bazy      |
| Integracja | `npm run test:integration` | Aplikacja + prawdziwa baza SQLite w pliku tymczasowym        |
| E2E        | `npm run test:e2e`         | Prawdziwa przeglądarka (Playwright) na uruchomionym serwerze |
| Wszystko   | `npm test`                 | Typecheck + wszystkie poziomy                                |

Praca w rytmie TDD: najpierw test, który nie przechodzi (red), potem minimalny kod (green), potem porządki (refactor).
CI (GitHub Actions) przy każdej zmianie: najpierw szybkie bramki na Linuksie i Windowsie, potem E2E. Pierwszy błąd zatrzymuje pipeline.

Zasady pisania kodu: [CLAUDE.md](CLAUDE.md).
