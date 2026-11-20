-- Ustawienia zmieniane przez użytkownika (progi kolorów, przypomnienia). Brak wiersza = wartość domyślna z kodu.
CREATE TABLE app_settings (
  key TEXT PRIMARY KEY,
  value INTEGER NOT NULL
);

-- Kto, kiedy i co zmienił w ustawieniach (aplikacja nie ma logowania, więc zapisujemy osobę).
CREATE TABLE settings_history (
  id INTEGER PRIMARY KEY,
  happened_on TEXT NOT NULL,
  person TEXT NOT NULL,
  key TEXT NOT NULL,
  old_value INTEGER NOT NULL,
  new_value INTEGER NOT NULL
);
