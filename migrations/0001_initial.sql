CREATE TABLE owners (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE displays (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  display_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL DEFAULT '',
  site_id TEXT,
  site_name TEXT,
  refresh_interval INTEGER NOT NULL DEFAULT 30 CHECK (refresh_interval > 0),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX idx_displays_owner_display ON displays(owner_id, display_id);
CREATE INDEX idx_displays_owner ON displays(owner_id);

CREATE TABLE display_line_filters (
  display_id TEXT NOT NULL REFERENCES displays(id) ON DELETE CASCADE,
  line_number TEXT NOT NULL,
  PRIMARY KEY (display_id, line_number)
);

CREATE TABLE display_direction_filters (
  display_id TEXT NOT NULL REFERENCES displays(id) ON DELETE CASCADE,
  direction TEXT NOT NULL,
  PRIMARY KEY (display_id, direction)
);

CREATE TABLE display_mode_filters (
  display_id TEXT NOT NULL REFERENCES displays(id) ON DELETE CASCADE,
  mode TEXT NOT NULL,
  PRIMARY KEY (display_id, mode)
);