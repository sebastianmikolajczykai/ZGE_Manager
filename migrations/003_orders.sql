-- Zlecenia, ich kroki (kopia szablonu z chwili przyjęcia) i historia „kto, co, kiedy”.
CREATE TABLE orders (
  id INTEGER PRIMARY KEY,
  client_name TEXT NOT NULL CHECK (length(trim(client_name)) > 0),
  phone TEXT NOT NULL,
  town TEXT NOT NULL,
  work_type_id INTEGER NOT NULL REFERENCES work_types(id),
  plot TEXT,
  office TEXT,
  price_grosze INTEGER CHECK (price_grosze IS NULL OR price_grosze >= 0),
  note TEXT,
  measurement_on TEXT,
  received_on TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed')),
  completed_on TEXT
);

CREATE TABLE order_steps (
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  position INTEGER NOT NULL CHECK (position >= 1),
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('own', 'waiting', 'daily', 'scheduled')),
  limit_days INTEGER CHECK (limit_days IS NULL OR limit_days >= 1),
  provisional INTEGER NOT NULL DEFAULT 0 CHECK (provisional IN (0, 1)),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'done')),
  started_on TEXT,
  done_on TEXT,
  done_by TEXT,
  last_checked_on TEXT,
  last_checked_by TEXT,
  UNIQUE (order_id, position)
);

CREATE TABLE order_history (
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  happened_at TEXT NOT NULL DEFAULT (datetime('now')),
  happened_on TEXT NOT NULL,
  person TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('created', 'step_done', 'checked', 'undone')),
  step_position INTEGER,
  step_name TEXT
);

CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_history_order ON order_history(order_id, id);
