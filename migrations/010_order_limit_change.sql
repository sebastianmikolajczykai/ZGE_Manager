-- Zmiana limitu kroku w jednym zleceniu (np. urząd zapowiedział dłuższy termin) – nowe zdarzenie w historii.
-- SQLite nie zmienia CHECK, więc przebudowa tabeli (dane przepisane 1:1).
CREATE TABLE order_history_new (
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  happened_at TEXT NOT NULL DEFAULT (datetime('now')),
  happened_on TEXT NOT NULL,
  person TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('created', 'step_done', 'checked', 'undone', 'payment_call', 'limit_changed')),
  step_position INTEGER,
  step_name TEXT,
  note TEXT
);
INSERT INTO order_history_new (id, order_id, happened_at, happened_on, person, action, step_position, step_name, note)
  SELECT id, order_id, happened_at, happened_on, person, action, step_position, step_name, note FROM order_history;
DROP TABLE order_history;
ALTER TABLE order_history_new RENAME TO order_history;
CREATE INDEX idx_history_order ON order_history(order_id, id);
