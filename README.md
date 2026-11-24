# ZGE Menedżer (MVP)

Żywa lista zleceń dla firmy geodezyjnej ZGE: kroki na rodzaj pracy, limity dni, kolory pilności, oferty i płatności.

## Zasada: dane zostają na komputerze

Aplikacja działa na komputerze firmy i otwiera się w przeglądarce pod `http://localhost:3000`.
Dane są w jednym pliku SQLite (`dane/zge.db`), serwer nasłuchuje tylko na `127.0.0.1`, więc nic nie wychodzi do internetu.

## Instalacja na laptopie (Windows), bez wpisywania poleceń

Robi się to raz. Potrzebny jest internet (tylko przy pierwszym uruchomieniu).

1. **Zainstaluj Node.js**: wejdź na https://nodejs.org, pobierz wersję **LTS** i zainstaluj (same „Dalej”).
2. **Skopiuj folder aplikacji** na laptopa (z GitHuba: „Code” → „Download ZIP”, potem rozpakuj), np. do `C:\ZGE Menedżer`. Nie wkładaj go do OneDrive (baza w trakcie pracy nie lubi synchronizacji).
3. **Kliknij dwa razy `Uruchom ZGE.bat`**. Za pierwszym razem instalacja potrwa kilka minut, potem otworzy się przeglądarka z aplikacją.
4. **Kliknij dwa razy `Włącz autostart.bat`**. Od teraz aplikacja uruchomi się sama po włączeniu komputera.
5. **Ustaw folder na kopie** (zalecane, patrz niżej).

Na pasku zadań pojawi się zminimalizowane okno „ZGE Menedzer - nie zamykaj tego okna”. To jest działająca aplikacja: zamknięcie tego okna ją wyłącza.

| Plik                   | Co robi                                                                                 |
| ---------------------- | --------------------------------------------------------------------------------------- |
| `Uruchom ZGE.bat`      | Uruchamia aplikację i otwiera przeglądarkę (gdy już działa: tylko otwiera przeglądarkę) |
| `Zatrzymaj ZGE.bat`    | Wyłącza aplikację                                                                       |
| `Włącz autostart.bat`  | Aplikacja startuje sama po włączeniu komputera                                          |
| `Wyłącz autostart.bat` | Cofa autostart (aplikacja dalej działa po kliknięciu `Uruchom ZGE.bat`)                 |

Gdy aplikacja nie wstaje, przyczyna jest zapisana w pliku `dane\serwer.log`.

## Codzienna kopia bazy

Aplikacja sama robi jedną kopię bazy dziennie: zaraz po uruchomieniu i potem sprawdza co godzinę, czy dzisiejsza kopia już jest.
Kopie mają nazwy z datą, np. `zge-2026-11-24.db`. Trzymanych jest **30 ostatnich**, starsze są usuwane same.

Domyślnie kopie trafiają do `dane\kopie`, czyli na ten sam dysk. Żeby przetrwały awarię laptopa, wskaż folder w OneDrive lub na innym dysku:

1. W folderze aplikacji skopiuj plik `.env.example` i nazwij kopię `.env`.
2. Otwórz `.env` w Notatniku i zmień linię `BACKUP_DIR`, np. `BACKUP_DIR=C:\Users\NazwaUzytkownika\OneDrive\ZGE kopie` (folder założy się sam). W `BACKUP_KEEP` można zmienić liczbę trzymanych kopii.
3. Zapisz, kliknij `Zatrzymaj ZGE.bat`, potem `Uruchom ZGE.bat`.

**Przywrócenie kopii:** kliknij `Zatrzymaj ZGE.bat`, przenieś gdzieś obecne pliki `dane\zge.db`, `dane\zge.db-wal` i `dane\zge.db-shm` (na wszelki wypadek), skopiuj wybraną kopię do folderu `dane` i zmień jej nazwę na `zge.db`, potem kliknij `Uruchom ZGE.bat`.

## Uruchomienie dla programisty

```bash
npm ci
cp .env.example .env   # opcjonalnie: DB_PATH, PORT, BACKUP_DIR, BACKUP_KEEP
npm start
```

## Przydatne ekrany

- **Widok na monitor**: `http://localhost:3000/monitor` (link „📺 Widok na monitor” w menu). Duże kafle do powieszenia na telewizorze, odświeża się sam.
- **Filtr „Moje”**: na Tablicy wybierz osobę z listy. Ta przeglądarka zapamięta wybór i pokaże przycisk „👤 Moje”. Zlecenie jest „czyje” według osoby przypisanej do bieżącego kroku, a gdy jej nie ma, według osoby prowadzącej (karta zlecenia → „Osoby w zleceniu”).

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
