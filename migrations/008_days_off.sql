-- Dni wolne firmy (urlop, długi weekend): aplikacja ich nie liczy, tak jak świąt.
CREATE TABLE days_off (
  id INTEGER PRIMARY KEY,
  from_on TEXT NOT NULL,
  to_on TEXT NOT NULL CHECK (to_on >= from_on),
  note TEXT,
  added_by TEXT NOT NULL
);
