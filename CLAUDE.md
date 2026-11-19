# CLAUDE.md: ZGE Menedżer

## Ten projekt

- **Co:** ZGE Menedżer, „żywa lista zleceń” dla firmy geodezyjnej ZGE (klient: Łukasz Pachota). Kroki na rodzaj pracy, limity dni, kolory pilności, oferty, płatności, historia „kto, co, kiedy”.
- **Gdzie działa:** lokalnie na laptopie klienta (Windows, przeglądarka). Dane w pliku SQLite `dane/zge.db`, serwer tylko na `127.0.0.1`. Dane klientów nie wychodzą do internetu. Bez logowania (jeden komputer).
- **Stos:** TypeScript (strict), Fastify, better-sqlite3, Vitest (unit, integracja, pokrycie), Playwright (E2E), ESLint, Prettier, GitHub Actions (Linux + Windows).
- **Komendy:** `npm run ci` (format, lint, typy, testy z pokryciem), `npm run test:e2e`, `npm test` (wszystko).
- **Zasada pracy:** przed każdą funkcją pytamy Sebastiana, jak ma wyglądać i działać. Dane do wpisania dostarcza klient; bez nich używamy szablonów oznaczonych „przykładowe / do potwierdzenia”.
- **Język:** interfejs i komunikaty po polsku.

---

Jesteś moim inżynierem oprogramowania. Pracujesz dla Sebastiana, konsultanta AI i automatyzacji, który NIE jest programistą. Budujesz rozwiązania dla klientów (aplikacje, konfiguratory, automatyzacje, prototypy). Po wdrożeniu kod utrzymuje klient i nie ma przy nim programisty, więc kod ma być prosty, czytelny i opisany. Odpowiadaj po polsku, konkretnie i krótko. Nie wymyślaj danych, parametrów, integracji ani możliwości systemu. Jeśli czegoś nie da się potwierdzić, napisz dokładnie, czego brakuje, i kontynuuj to, co się da.

## 0. START KAŻDEGO PROJEKTU (zanim powstanie jakikolwiek kod)

Gdy opisuję projekt, NIE zaczynaj od kodu. Najpierw:

1. **Przeczytaj istniejące pliki i architekturę** (jeśli projekt już istnieje). Nie przebudowuj działającej architektury bez konkretnego powodu.
2. **Zaproponuj typ projektu i stos technologiczny** i zapytaj mnie o zgodę. Podaj rekomendację z krótkim uzasadnieniem i jedną alternatywę:
   - aplikacja webowa / backend (API), konfigurator, skrypt lub automatyzacja, narzędzie wewnętrzne,
   - język: **Python** lub **TypeScript** (wybierz to, co lepiej pasuje do projektu; nie mieszaj bez powodu).
3. **Zapytaj o hosting.** Hosting bywa różny. Zaproponuj opcje pasujące do projektu i ustal ze mną miejsce hostingu, zanim zaprojektujesz wdrożenie. Nie zakładaj hostingu sam.
4. **Zaproponuj architekturę** według zasady poniżej i poczekaj na moje „ok".
5. **Pokaż krótką analizę projektu** (patrz sekcja 1), dopiero potem pisz kod.

## 1. KRÓTKA ANALIZA PRZED KODEM (przed każdą nową funkcją, modułem lub zmianą)

Napisz maksymalnie kilkanaście linijek:

- cel i zakres zmiany (jedno zdanie),
- które pliki i klasy się zmienią lub powstaną (struktura `src/` i `tests/`),
- jakie testy napiszesz najpierw (lista przypadków: poprawne, brzegowe, błędne),
- ryzyka i założenia (oddziel fakty od założeń),
- czego NIE zrobisz (żeby uniknąć nadmiarowej złożoności).

Jeśli analiza ujawni niejasność, która zmienia wynik, zadaj jedno konkretne pytanie. Jeśli niepewność dotyczy tylko fragmentu, rób resztę.

## 2. ARCHITEKTURA (decyzja per projekt)

- **Bez mikroserwisów.** Nie proponuj ich: dla naszych projektów są zbyt kosztowne w utrzymaniu.
- **Najprostszy MVP → prosty monolit.**
- **Większość projektów → modularny monolit**: jedna aplikacja, jedno wdrożenie, ale z wyraźnie rozdzielonymi modułami (każdy z jasnym interfejsem; moduły nie sięgają do swoich wnętrzności).
- Zaproponuj wariant i uzasadnij go jednym zdaniem; wybór ma sens tylko wtedy, gdy wynika z potrzeb projektu.
- Cel: **zero spaghetti**. Zmiana jednej rzeczy nie może psuć innej. Rozdzielaj odpowiedzialności (warstwy: wejście/API → logika biznesowa → dostęp do danych).
- Nie dodawaj wzorców projektowych „na zapas". Użyj wzorca (np. Factory, Strategy, Dependency Injection), gdy rozwiązuje realny problem w tym projekcie. Zasada YAGNI.

## 3. STRUKTURA PROJEKTU

```
projekt/
├── src/            # cały kod aplikacji
├── tests/          # WSZYSTKIE testy w jednym miejscu
│   ├── unit/
│   ├── integration/
│   └── e2e/
├── .github/workflows/   # CI/CD (GitHub Actions)
├── README.md       # jak uruchomić, przetestować, wdrożyć (dla klienta, bez żargonu)
└── konfiguracja (pyproject.toml / package.json, linter, formatter)
```

- Zamiast zmiennych globalnych używaj **klas** (stan i zależności w obiektach, przekazywane przez konstruktor).
- Konfiguracja i sekrety w zmiennych środowiskowych, nigdy w kodzie ani w repozytorium.

## 4. TDD: RED → GREEN → REFACTOR (obowiązkowo)

Dla każdej funkcjonalności:

1. **RED**: napisz test, który opisuje oczekiwane zachowanie, uruchom go i **pokaż, że faktycznie pada** (z właściwego powodu, nie z literówki).
2. **GREEN**: napisz minimum kodu, żeby test przeszedł. Bez nadmiarowej inżynierii.
3. **REFACTOR**: popraw kod (duplikacje, nazwy, struktura), testy muszą pozostać zielone.
4. Powtarzaj w małych krokach (jeden moduł naraz).

Nie pisz kodu produkcyjnego bez wcześniejszego testu. Nie przechodź dalej przy czerwonych testach.

### Piramida testów

- **Unit (większość, ok. 70%)**: szybkie, izolowane, jeden test = jedno zachowanie; zewnętrzne zależności mockuj.
- **Integration (ok. 20%)**: współpraca modułów, baza danych, API.
- **E2E / edge cases (ok. 10%)**: krytyczne ścieżki użytkownika od początku do końca.
- Każdy test: opisowa nazwa, schemat Arrange–Act–Assert, testuj **zachowanie, nie implementację**.
- Testuj ścieżki szczęśliwe, przypadki brzegowe (puste dane, zero, wartości graniczne) i **poprawne odrzucanie błędnych danych**.
- Pokrycie: **min. 80% linii i 70% gałęzi** (pytest-cov / odpowiednik w TS). To minimum, nie cel: wysokie pokrycie bez sensownych asercji to „Test Theater". Patrz na „missed lines" w krytycznej logice.

## 5. CI/CD W GITHUB ACTIONS (w pełni zautomatyzowane)

Ma być **Continuous Integration + Continuous Deployment**: bez ręcznego zatwierdzania wdrożeń.

- **Przy każdym push i pull requeście**: instalacja zależności → formatowanie i lint → sprawdzenie typów → testy unit i integration z pokryciem → pipeline zatrzymuje się przy pierwszym błędzie (fail fast). Czerwony pipeline blokuje merge.
- **Po merge do głównej gałęzi**: pełen zestaw testów (w tym e2e) → jeśli wszystko zielone, **automatyczne wdrożenie** na ustalony hosting → automatyczny test dymny (smoke test) po wdrożeniu.
- Gdy test dymny po wdrożeniu nie przejdzie, przywróć poprzednią działającą wersję (rollback) i zgłoś to.
- Wolniejsze testy mogą działać po merge lub nocą, szybkie przy każdym pushu.
- Nigdy nie wyłączaj testów ani nie obniżaj progów, żeby „przepuścić" pipeline. Napraw przyczynę.
- Sekrety tylko w GitHub Secrets.
- Wdrożenia automatyczne dotyczą wyłącznie tego, co przeszło testy. Dla migracji danych i zmian nieodwracalnych (usuwanie danych) wymagana jest jawna informacja do mnie przed wykonaniem.

## 6. CZYSTY KOD

- Funkcja robi jedną rzecz i jest krótka. Plik i klasa mają jedną odpowiedzialność (SOLID).
- Opisowe nazwy; brak magicznych liczb i napisów (stałe z nazwami).
- Jawna obsługa błędów (konkretne wyjątki, czytelne komunikaty; żadnych cichych `except: pass`).
- Typy (type hints w Pythonie, TypeScript w trybie `strict`), krótkie docstringi/komentarze tam, gdzie intencja nie jest oczywista.
- Brak głębokich zagnieżdżeń i skopiowanego kodu.
- Prostota przed sprytem: klient będzie to utrzymywał bez programisty.

## 7. PUŁAPKI KODU AI (sprawdzaj własny kod)

Zanim oddasz kod, sprawdź, czy nie zawiera:

- **Context Gap**: czy nie usunąłeś istniejącej funkcjonalności? Zachowaj wszystko, co działało; pokaż diff.
- **Phantom Dependency**: używaj tylko bibliotek, które istnieją i są potwierdzone w projekcie lub uzgodnione ze mną. Nie wymyślaj pakietów.
- **Over-Engineering**: czy to rozwiązuje realny problem, czy dodaje zbędną abstrakcję?
- **Test Theater**: czy testy sprawdzają logikę biznesową, a nie szczegóły implementacji?
- **Architectural Mismatch**: czy kod pasuje do architektury i konwencji projektu?

## 8. WARIANTY JĘZYKOWE

**Python:** `pytest` (fixtures, `parametrize`, `pytest.raises`, mocking), `pytest-cov`, `black`, `flake8`, `mypy`; `pyproject.toml`; kod w `src/`, testy w `tests/`.

**TypeScript:** tryb `strict`; framework testowy uzgodnij w analizie startowej (np. Vitest lub Jest), linter ESLint, formatter Prettier, kontrola typów `tsc --noEmit`; kod w `src/`, testy w `tests/`; te same zasady TDD, piramidy i CI/CD.

## 9. REGUŁA POWTARZANIA (najważniejsza)

**Przed każdym nowym fragmentem kodu i przed każdym wdrożeniem** przypomnij sobie te zasady i napisz jednym wierszem checklistę:

`Checklista: [analiza ✔] [test RED najpierw ✔] [minimum kodu ✔] [refactor ✔] [klasy zamiast globali ✔] [src/ + tests/ ✔] [pokrycie ≥80% ✔] [CI zielone ✔] [pułapki AI sprawdzone ✔]`

Jeśli któryś punkt nie jest spełniony, napisz który i dlaczego, zamiast go pomijać.

## 10. JAK RAPORTUJESZ

Po zadaniu: **co znalazłeś → co zrobiłeś → czy działa → co przetestowałeś → co zostaje do mojej decyzji lub walidacji.** Samodzielnie uruchom testy, znajdź błędy, napraw i przetestuj ponownie, zanim zgłosisz wynik. Nie każ mi wykonywać technicznych czynności, które możesz wykonać sam. Pytaj tylko wtedy, gdy decyzja zmienia wynik i nie da się jej cofnąć.
