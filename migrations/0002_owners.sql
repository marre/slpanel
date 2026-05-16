CREATE TABLE owners (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO owners (id)
SELECT DISTINCT owner_id
FROM displays;

ALTER TABLE displays RENAME TO displays_old;

CREATE TABLE displays (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  display_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL DEFAULT '',
  site_id TEXT,
  site_name TEXT,
  refresh_interval INTEGER NOT NULL DEFAULT 30,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (owner_id) REFERENCES owners(id) ON DELETE CASCADE
);

INSERT INTO displays (
  id,
  owner_id,
  display_id,
  name,
  site_id,
  site_name,
  refresh_interval,
  created_at,
  updated_at
)
SELECT
  id,
  owner_id,
  display_id,
  name,
  site_id,
  site_name,
  refresh_interval,
  created_at,
  updated_at
FROM displays_old;

DROP TABLE displays_old;

CREATE UNIQUE INDEX idx_displays_owner_display ON displays(owner_id, display_id);
CREATE INDEX idx_displays_owner ON displays(owner_id);
