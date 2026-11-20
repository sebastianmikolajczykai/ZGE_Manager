-- Zakładka Niezapłacone: znacznik kroku „Zapłata” oraz rozmowy o zapłacie (z notatką) w historii zlecenia.
ALTER TABLE step_templates ADD COLUMN payment INTEGER NOT NULL DEFAULT 0 CHECK (payment IN (0, 1));
ALTER TABLE order_steps ADD COLUMN payment INTEGER NOT NULL DEFAULT 0 CHECK (payment IN (0, 1));

-- Istniejący szablon „Zapłata” (rodzaj pracy z MVP) dostaje znacznik.
UPDATE step_templates SET payment = 1 WHERE name = 'Zapłata' AND kind = 'waiting';
UPDATE order_steps SET payment = 1 WHERE name = 'Zapłata' AND kind = 'waiting';

-- Historia zlecenia: nowe zdarzenie „rozmowa o zapłacie” i notatka. SQLite nie zmienia CHECK, więc przebudowa tabeli.
CREATE TABLE order_history_new (
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  happened_at TEXT NOT NULL DEFAULT (datetime('now')),
  happened_on TEXT NOT NULL,
  person TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('created', 'step_done', 'checked', 'undone', 'payment_call')),
  step_position INTEGER,
  step_name TEXT,
  note TEXT
);
INSERT INTO order_history_new (id, order_id, happened_at, happened_on, person, action, step_position, step_name)
  SELECT id, order_id, happened_at, happened_on, person, action, step_position, step_name FROM order_history;
DROP TABLE order_history;
ALTER TABLE order_history_new RENAME TO order_history;
CREATE INDEX idx_history_order ON order_history(order_id, id);
