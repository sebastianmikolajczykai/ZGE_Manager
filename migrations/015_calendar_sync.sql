-- Synchronizacja przypomnień „Zadzwoń” z Kalendarzem Google (domyślnie wyłączona).
-- Wydarzenia, które aplikacja założyła w kalendarzu „ZGE przypomnienia”: klucz sprawy → numer wydarzenia w Google.
CREATE TABLE calendar_sync_events (
  key TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  event_date TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL
);

-- Stan: włączona, numer kalendarza w Google, ostatnia udana synchronizacja, ostatni błąd. Brak wiersza = brak wartości.
CREATE TABLE calendar_sync_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Kto, kiedy włączył/wyłączył synchronizację albo połączył/odłączył konto Google.
CREATE TABLE calendar_sync_history (
  id INTEGER PRIMARY KEY,
  happened_on TEXT NOT NULL,
  person TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('enabled', 'disabled', 'connected', 'disconnected'))
);
