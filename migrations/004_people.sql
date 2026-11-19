-- Osoby do przycisków „kto zrobił” (wpisywane w ustawieniach aplikacji, nie w kodzie).
CREATE TABLE people (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1))
);
CREATE UNIQUE INDEX idx_people_name ON people(lower(name)) WHERE active = 1;
