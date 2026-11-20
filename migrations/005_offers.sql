-- Oferty wysłane klientom: przypomnienie o telefonie po 7 dniach roboczych, historia „kto, co, kiedy”.
CREATE TABLE offers (
  id INTEGER PRIMARY KEY,
  client_name TEXT NOT NULL CHECK (length(trim(client_name)) > 0),
  phone TEXT NOT NULL,
  work_type_id INTEGER NOT NULL REFERENCES work_types(id),
  town TEXT,
  plot TEXT,
  price_grosze INTEGER CHECK (price_grosze IS NULL OR price_grosze >= 0),
  note TEXT,
  sent_on TEXT NOT NULL,
  sent_by TEXT NOT NULL,
  last_contact_on TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'accepted', 'rejected', 'closed')),
  closed_on TEXT,
  order_id INTEGER REFERENCES orders(id)
);

CREATE TABLE offer_history (
  id INTEGER PRIMARY KEY,
  offer_id INTEGER NOT NULL REFERENCES offers(id) ON DELETE CASCADE,
  happened_at TEXT NOT NULL DEFAULT (datetime('now')),
  happened_on TEXT NOT NULL,
  person TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('created', 'called', 'contact_ended', 'rejected', 'accepted')),
  note TEXT
);

CREATE INDEX idx_offers_status ON offers(status);
CREATE INDEX idx_offer_history_offer ON offer_history(offer_id, id);
