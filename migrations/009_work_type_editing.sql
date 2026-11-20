-- Edycja rodzajów prac w Ustawieniach: ukrywanie (rodzaj z historią zleceń nie może zniknąć) i historia zmian.
ALTER TABLE work_types ADD COLUMN hidden INTEGER NOT NULL DEFAULT 0 CHECK (hidden IN (0, 1));

CREATE TABLE work_type_history (
  id INTEGER PRIMARY KEY,
  happened_on TEXT NOT NULL,
  person TEXT NOT NULL,
  work_type_name TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('created', 'changed', 'copied', 'hidden', 'shown', 'deleted'))
);
