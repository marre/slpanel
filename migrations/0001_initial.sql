CREATE TABLE displays (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  display_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL DEFAULT '',
  site_id TEXT,
  site_name TEXT,
  refresh_interval INTEGER NOT NULL DEFAULT 30,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX idx_displays_owner_display ON displays(owner_id, display_id);
CREATE INDEX idx_displays_owner ON displays(owner_id);
