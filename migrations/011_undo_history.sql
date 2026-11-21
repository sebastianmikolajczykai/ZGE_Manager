-- Cofanie wpisów z historii: poprzedni stan zapisany przy wpisie (undo_data, JSON) i znacznik „cofnięte”.
-- Tylko nowe kolumny; istniejące wpisy zostają bez zmian (stare wpisy bez undo_data cofa się tylko, gdy da się to zrobić bezpiecznie).
ALTER TABLE order_history ADD COLUMN undo_data TEXT;
ALTER TABLE order_history ADD COLUMN reverted INTEGER NOT NULL DEFAULT 0 CHECK (reverted IN (0, 1));

-- Historia ofert: nowe zdarzenie „undone” (cofnięcie). SQLite nie zmienia CHECK, więc przebudowa tabeli (dane przepisane 1:1).
CREATE TABLE offer_history_new (
  id INTEGER PRIMARY KEY,
  offer_id INTEGER NOT NULL REFERENCES offers(id) ON DELETE CASCADE,
  happened_at TEXT NOT NULL DEFAULT (datetime('now')),
  happened_on TEXT NOT NULL,
  person TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('created', 'called', 'contact_ended', 'rejected', 'accepted', 'undone')),
  note TEXT,
  undo_data TEXT,
  reverted INTEGER NOT NULL DEFAULT 0 CHECK (reverted IN (0, 1))
);
INSERT INTO offer_history_new (id, offer_id, happened_at, happened_on, person, action, note)
  SELECT id, offer_id, happened_at, happened_on, person, action, note FROM offer_history;
DROP TABLE offer_history;
ALTER TABLE offer_history_new RENAME TO offer_history;
CREATE INDEX idx_offer_history_offer ON offer_history(offer_id, id);
