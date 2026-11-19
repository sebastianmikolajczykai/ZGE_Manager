-- Rodzaje prac (np. podział nieruchomości) i ich szablony kroków.
CREATE TABLE work_types (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE step_templates (
  id INTEGER PRIMARY KEY,
  work_type_id INTEGER NOT NULL REFERENCES work_types(id) ON DELETE CASCADE,
  position INTEGER NOT NULL CHECK (position >= 1),
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  kind TEXT NOT NULL CHECK (kind IN ('own', 'waiting', 'daily', 'scheduled')),
  limit_days INTEGER CHECK (limit_days IS NULL OR limit_days >= 1),
  provisional INTEGER NOT NULL DEFAULT 0 CHECK (provisional IN (0, 1)),
  UNIQUE (work_type_id, position)
);
