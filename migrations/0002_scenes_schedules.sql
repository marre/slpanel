-- Reusable scenes and schedules. Devices retain their permanent display IDs.
-- This migration replaces the unmerged original 0002 presentation proposal.
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

CREATE TABLE scenes (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  data_source_id TEXT NOT NULL REFERENCES data_sources(id) ON DELETE RESTRICT,
  visualization TEXT NOT NULL DEFAULT 'departures-list',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_scenes_owner ON scenes(owner_id);

CREATE TABLE schedules (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'Europe/Stockholm',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_schedules_owner ON schedules(owner_id);

CREATE TABLE schedule_rules (
  id TEXT PRIMARY KEY,
  schedule_id TEXT NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
  days TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  scene_id TEXT NOT NULL REFERENCES scenes(id) ON DELETE RESTRICT
);
CREATE INDEX idx_schedule_rules_schedule ON schedule_rules(schedule_id);

CREATE TABLE device_assignments (
  display_id TEXT PRIMARY KEY REFERENCES displays(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('scene', 'schedule')),
  scene_id TEXT REFERENCES scenes(id) ON DELETE RESTRICT,
  schedule_id TEXT REFERENCES schedules(id) ON DELETE RESTRICT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (
    (kind = 'scene' AND scene_id IS NOT NULL AND schedule_id IS NULL)
    OR (kind = 'schedule' AND schedule_id IS NOT NULL AND scene_id IS NULL)
  )
);

-- Preserve currently configured devices: one reusable scene for each old display.
INSERT INTO data_sources (id,owner_id,name,site_id,site_name,refresh_interval)
SELECT 'legacy-source:' || id, owner_id,
  COALESCE(NULLIF(site_name, ''), NULLIF(name, ''), 'Existing stop'),
  site_id, site_name, refresh_interval
FROM displays;

INSERT INTO data_source_line_filters (data_source_id,line_number)
SELECT 'legacy-source:' || display_id, line_number FROM display_line_filters;
INSERT INTO data_source_direction_filters (data_source_id,direction)
SELECT 'legacy-source:' || display_id, direction FROM display_direction_filters;
INSERT INTO data_source_mode_filters (data_source_id,mode)
SELECT 'legacy-source:' || display_id, mode FROM display_mode_filters;

INSERT INTO scenes (id,owner_id,name,data_source_id,visualization)
SELECT 'legacy-scene:' || id, owner_id, COALESCE(NULLIF(name, ''), 'Existing display'),
  'legacy-source:' || id, 'departures-list'
FROM displays;

INSERT INTO device_assignments (display_id,kind,scene_id)
SELECT id,'scene','legacy-scene:' || id FROM displays;
