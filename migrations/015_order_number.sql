-- Numer zlecenia nadawany w biurze (np. „125 podział”, „126 syt wys”): wolny tekst, opcjonalny.
-- Istniejące zlecenia zostają bez numeru (pokazują się jak dotąd, po imieniu i nazwisku).
ALTER TABLE orders ADD COLUMN order_number TEXT;

-- Historia zlecenia: nowe zdarzenie „number_set” (zmiana numeru z karty, z cofaniem).
-- SQLite nie zmienia CHECK, więc przebudowa tabeli (dane przepisane 1:1, razem ze stanem do cofania).
CREATE TABLE order_history_new (
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  happened_at TEXT NOT NULL DEFAULT (datetime('now')),
  happened_on TEXT NOT NULL,
  person TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('created', 'step_done', 'checked', 'undone', 'payment_call', 'limit_changed', 'lead_changed', 'step_assigned', 'measurement_set', 'number_set')),
  step_position INTEGER,
  step_name TEXT,
  note TEXT,
  undo_data TEXT,
  reverted INTEGER NOT NULL DEFAULT 0 CHECK (reverted IN (0, 1))
);
INSERT INTO order_history_new (id, order_id, happened_at, happened_on, person, action, step_position, step_name, note, undo_data, reverted)
  SELECT id, order_id, happened_at, happened_on, person, action, step_position, step_name, note, undo_data, reverted FROM order_history;
DROP TABLE order_history;
ALTER TABLE order_history_new RENAME TO order_history;
CREATE INDEX idx_history_order ON order_history(order_id, id);
