-- Dane do wiadomości SMS dla klienta (numer konta, link do opinii). Brak wiersza = puste pole.
CREATE TABLE message_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Kto, kiedy i co zmienił w tych polach.
CREATE TABLE message_settings_history (
  id INTEGER PRIMARY KEY,
  happened_on TEXT NOT NULL,
  person TEXT NOT NULL,
  key TEXT NOT NULL,
  old_value TEXT NOT NULL,
  new_value TEXT NOT NULL
);
