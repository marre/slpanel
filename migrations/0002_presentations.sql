-- Reusable departure sources, full-screen presentations, device assignments, and weekly schedule.
-- Keep the legacy display stop/filter columns for older devices and the existing editor.
CREATE TABLE data_sources (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  site_id TEXT,
  site_name TEXT,
  refresh_interval INTEGER NOT NULL CHECK (refresh_interval > 0),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_data_sources_owner ON data_sources(owner_id);

CREATE TABLE data_source_line_filters (
  data_source_id TEXT NOT NULL REFERENCES data_sources(id) ON DELETE CASCADE,
  line_number TEXT NOT NULL,
  PRIMARY KEY (data_source_id, line_number)
);
CREATE TABLE data_source_direction_filters (
  data_source_id TEXT NOT NULL REFERENCES data_sources(id) ON DELETE CASCADE,
  direction TEXT NOT NULL,
  PRIMARY KEY (data_source_id, direction)
);
CREATE TABLE data_source_mode_filters (
  data_source_id TEXT NOT NULL REFERENCES data_sources(id) ON DELETE CASCADE,
  mode TEXT NOT NULL,
  PRIMARY KEY (data_source_id, mode)
);

CREATE TABLE presentations (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  data_source_id TEXT NOT NULL REFERENCES data_sources(id) ON DELETE RESTRICT,
  visualization TEXT NOT NULL DEFAULT 'departures-list',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_presentations_owner ON presentations(owner_id);

CREATE TABLE display_controls (
  display_id TEXT PRIMARY KEY REFERENCES displays(id) ON DELETE CASCADE,
  timezone TEXT NOT NULL DEFAULT 'Europe/Stockholm',
  default_presentation_id TEXT REFERENCES presentations(id) ON DELETE RESTRICT,
  manual_mode TEXT CHECK (manual_mode IN ('presentation', 'off')),
  manual_presentation_id TEXT REFERENCES presentations(id) ON DELETE RESTRICT,
  manual_until TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE display_schedule_rules (
  id TEXT PRIMARY KEY,
  display_id TEXT NOT NULL REFERENCES displays(id) ON DELETE CASCADE,
  days TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('presentation', 'off')),
  presentation_id TEXT REFERENCES presentations(id) ON DELETE RESTRICT
);
CREATE INDEX idx_schedule_display ON display_schedule_rules(display_id);

-- Migrate current stop configurations without changing stable physical display IDs.
INSERT INTO data_sources (
  id, owner_id, name, site_id, site_name, refresh_interval
)
SELECT 'legacy-source:' || id, owner_id,
  COALESCE(NULLIF(site_name, ''), NULLIF(name, ''), 'Existing stop'),
  site_id, site_name, refresh_interval
FROM displays;

INSERT INTO data_source_line_filters (data_source_id, line_number)
SELECT 'legacy-source:' || display_id, line_number FROM display_line_filters;
INSERT INTO data_source_direction_filters (data_source_id, direction)
SELECT 'legacy-source:' || display_id, direction FROM display_direction_filters;
INSERT INTO data_source_mode_filters (data_source_id, mode)
SELECT 'legacy-source:' || display_id, mode FROM display_mode_filters;

INSERT INTO presentations (id, owner_id, name, data_source_id, visualization)
SELECT 'legacy-presentation:' || id, owner_id,
  COALESCE(NULLIF(name, ''), 'Existing display'), 'legacy-source:' || id, 'departures-list'
FROM displays;

INSERT INTO display_controls (display_id, default_presentation_id)
SELECT id, 'legacy-presentation:' || id FROM displays;
