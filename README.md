# ZGE Menedżer (MVP)

Żywa lista zleceń dla firmy geodezyjnej ZGE: kroki na rodzaj pracy, limity dni, kolory pilności, oferty i płatności.

## Zasada: dane zostają na komputerze

Aplikacja działa na komputerze firmy i otwiera się w przeglądarce pod `http://localhost:3000`.
Dane są w jednym pliku SQLite (`dane/zge.db`), serwer nasłuchuje tylko na `127.0.0.1`, więc nic nie wychodzi do internetu.
Wyjątek to opcjonalna synchronizacja z Kalendarzem Google (domyślnie wyłączona, opis niżej): do Google trafia wtedy tylko numer oferty lub zlecenia, data i link do aplikacji.

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

Przy aktualizacji programu, która zmienia budowę bazy, aplikacja przed zmianą robi dodatkową kopię `zge-przed-aktualizacja-RRRR-MM-DD.db` w tym samym folderze. Tych kopii nic nie usuwa samo; można je skasować ręcznie, gdy wszystko działa.

Domyślnie kopie trafiają do `dane\kopie`, czyli na ten sam dysk. Żeby przetrwały awarię laptopa, wskaż folder w OneDrive lub na innym dysku:

1. W folderze aplikacji skopiuj plik `.env.example` i nazwij kopię `.env`.
2. Otwórz `.env` w Notatniku i zmień linię `BACKUP_DIR`, np. `BACKUP_DIR=C:\Users\NazwaUzytkownika\OneDrive\ZGE kopie` (folder założy się sam). W `BACKUP_KEEP` można zmienić liczbę trzymanych kopii.
3. Zapisz, kliknij `Zatrzymaj ZGE.bat`, potem `Uruchom ZGE.bat`.

**Przywrócenie kopii:** kliknij `Zatrzymaj ZGE.bat`, przenieś gdzieś obecne pliki `dane\zge.db`, `dane\zge.db-wal` i `dane\zge.db-shm` (na wszelki wypadek), skopiuj wybraną kopię do folderu `dane` i zmień jej nazwę na `zge.db`, potem kliknij `Uruchom ZGE.bat`.

## Kalendarz Google (przypomnienia „Zadzwoń”)

Gdy synchronizacja jest włączona, aplikacja sama zakłada w Google osobny kalendarz **„ZGE przypomnienia”** i wpisuje do niego całodniowe wydarzenia:

- „Zadzwoń: oferta nr 12”: w dniu, w którym mija termin telefonu w sprawie oferty (domyślnie 7 dni roboczych od wysłania albo od ostatniego telefonu),
- „Zadzwoń: zapłata, zlecenie nr 34”: w dniu, w którym mija limit kroku „Zapłata”.

Po odznaczeniu w aplikacji (telefon z „przypomnij znów”, kontakt zakończony, odrzucona, przyjęta, zapłacone) wydarzenie znika albo przesuwa się na nowy termin. Gdy termin minął, a nikt nic nie odznaczył, wydarzenie przechodzi na dziś (albo najbliższy dzień roboczy), więc ciągle jest widoczne. Aplikacja sprawdza kalendarz po starcie, co 5 minut i chwilę po każdym kliknięciu.

**Prywatność:** do Google trafia tylko numer, data i link do karty w aplikacji (link działa tylko na komputerze w biurze). Bez imienia i nazwiska, telefonu i kwoty. Aplikacja ma uprawnienie `calendar.app.created`: widzi tylko kalendarze, które sama założyła, a nie prywatne wydarzenia właściciela konta.

**Bez internetu albo po wygaśnięciu połączenia** program działa normalnie, a na górze ekranu pojawia się czerwony pasek z wyjaśnieniem. Po powrocie internetu kalendarz zaktualizuje się sam.

### Jednorazowa konfiguracja (konto Gmail)

W Google Cloud (https://console.cloud.google.com), zalogowany na konto Google, którego kalendarz ma dostawać przypomnienia:

1. Utwórz nowy projekt, np. „ZGE Menedżer”.
2. **Interfejsy API i usługi → Biblioteka:** wyszukaj „Google Calendar API” i kliknij **Włącz**.
3. **Ekran zgody OAuth** (w nowszym wyglądzie: „Google Auth Platform”): nazwa aplikacji „ZGE Menedżer”, e-mail pomocy, odbiorcy **Zewnętrzni (External)**, e-mail kontaktowy.
4. Na liście uprawnień (Data Access / Zakresy) dodaj `https://www.googleapis.com/auth/calendar.app.created`.
5. **Odbiorcy (Audience): Opublikuj aplikację → „W wersji produkcyjnej” (In production).** Ważne: w trybie „Testowanie” Google unieważnia połączenie co 7 dni. Weryfikacja przez Google nie jest potrzebna; przy logowaniu pojawi się tylko ostrzeżenie „Aplikacja niezweryfikowana”.
6. **Klienci (Clients) → Utwórz klienta → typ aplikacji „Aplikacja komputerowa” (Desktop app).** Skopiuj **Identyfikator klienta** i **Tajny klucz klienta**.

Na komputerze w biurze:

7. W pliku `.env` (kopia `.env.example`) wpisz `GOOGLE_CLIENT_ID=...` i `GOOGLE_CLIENT_SECRET=...`, zapisz, kliknij `Zatrzymaj ZGE.bat`, potem `Uruchom ZGE.bat`. Klucze są tylko w tym pliku, nigdy w repozytorium.
8. W aplikacji: **Ustawienia → Kalendarz Google → „Połącz z Kalendarzem Google: (imię)”**. Zaloguj się w Google. Przy ostrzeżeniu „Google nie zweryfikował tej aplikacji” kliknij **Zaawansowane → Przejdź do ZGE Menedżer** i zezwól na dostęp. Logowanie musi być zrobione w przeglądarce na tym samym komputerze, na którym działa aplikacja.
9. Kliknij **„Włącz synchronizację: (imię)”**. W Kalendarzu Google pojawi się kalendarz „ZGE przypomnienia”. Można go udostępnić innym osobom w ustawieniach Kalendarza Google.

Token połączenia zapisuje się w `dane\google-token.json`. **Odłącz konto Google** w Ustawieniach usuwa ten plik i cofa dostęp w Google. **Wyłącz synchronizację** usuwa z kalendarza wydarzenia założone przez aplikację.

## Uruchomienie dla programisty

```bash
npm ci
cp .env.example .env   # opcjonalnie: DB_PATH, PORT, BACKUP_DIR, BACKUP_KEEP
npm start
```

## Przydatne ekrany

- **Widok na monitor**: `http://localhost:3000/monitor` (link „📺 Widok na monitor” w menu). Duże kafle do powieszenia na telewizorze, odświeża się sam.
- **Filtr „Moje”**: na Tablicy wybierz osobę z listy. Ta przeglądarka zapamięta wybór i pokaże przycisk „👤 Moje”. Zlecenie jest „czyje” według osoby przypisanej do bieżącego kroku, a gdy jej nie ma, według osoby prowadzącej (karta zlecenia → „Osoby w zleceniu”).

- **Numer zlecenia**: pole „Nr zlecenia” w formularzu (opcjonalne, dowolne litery i cyfry, np. „125 podział”). Na Tablicy, monitorze i w Niezapłaconych widać numer zamiast imienia i nazwiska; klient jest na rozwiniętej karcie i w Statystykach. Numer można wpisać lub zmienić później na karcie („Wpisz numer zlecenia”), zmiana trafia do Historii i da się ją cofnąć. Zlecenia bez numeru wyglądają jak dotąd.
- **Kwoty ukryte na listach**: Tablica, monitor, lista Ofert i lista Niezapłaconych nie pokazują cen ani sum (monitor widzą goście). Kwotę widać dopiero po kliknięciu (rozwinięta karta) i w Statystykach. Wiadomość SMS „do zapłaty” działa jak wcześniej.
- **Przypomnienia w Kalendarzu Google**: na karcie otwartej oferty i niezapłaconego zlecenia jest przycisk „📅 Dodaj przypomnienie do Kalendarza Google” na dzień telefonu (koniec okresu przypomnienia, najwcześniej dziś). To **nie jest automatyczna synchronizacja**: przycisk otwiera gotowy formularz w Google, a wydarzenie powstaje dopiero, gdy ktoś kliknie „Zapisz” na swoim koncie. Późniejsze zmiany w aplikacji nie zmieniają wydarzenia w kalendarzu. W tytule nie ma imienia i nazwiska ani kwot (zlecenie: numer; bez numeru imię i nazwisko), klient i telefon są w opisie.

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
