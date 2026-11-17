import { allRows, execute, executeBatch, firstRow } from './d1';
import { ApiError } from './errors';
import type { DisplayRecord } from './types';
import type {
  DataSourceInput,
  DataSourceRecord,
  DeviceAssignment,
  DeviceAssignmentInput,
  SceneInput,
  SceneRecord,
  ScheduleInput,
  ScheduleRecord,
} from './scene-types';

export interface SceneStore {
  listSources(owner: string): Promise<DataSourceRecord[]>;
  getSource(owner: string, id: string): Promise<DataSourceRecord | null>;
  saveSource(input: DataSourceInput, id?: string): Promise<DataSourceRecord>;
  deleteSource(owner: string, id: string): Promise<boolean>;
  listScenes(owner: string): Promise<SceneRecord[]>;
  getScene(owner: string, id: string): Promise<SceneRecord | null>;
  saveScene(input: SceneInput, id?: string): Promise<SceneRecord>;
  deleteScene(owner: string, id: string): Promise<boolean>;
  listSchedules(owner: string): Promise<ScheduleRecord[]>;
  getSchedule(owner: string, id: string): Promise<ScheduleRecord | null>;
  saveSchedule(input: ScheduleInput, id?: string): Promise<ScheduleRecord>;
  deleteSchedule(owner: string, id: string): Promise<boolean>;
  getAssignment(displayId: string): Promise<DeviceAssignment | null>;
  saveAssignment(
    displayId: string,
    owner: string,
    input: DeviceAssignmentInput,
  ): Promise<DeviceAssignment>;
  syncLegacy(display: DisplayRecord): Promise<void>;
}

const legacySource = (id: string) => 'legacy-source:' + id;
const legacyScene = (id: string) => 'legacy-scene:' + id;
function conflict(message: string): never {
  throw new ApiError(409, 'conflict', message);
}
function invalid(message: string): never {
  throw new ApiError(400, 'validation_error', message);
}
function copy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
function legacySourceData(display: DisplayRecord): DataSourceInput {
  return {
    owner_id: display.owner_id,
    name: display.site_name || display.name || 'Original stop',
    site_id: display.site_id,
    site_name: display.site_name,
    refresh_interval: display.refresh_interval,
    line_numbers: [...display.line_numbers],
    directions: [...display.directions],
    modes: [...display.modes],
  };
}
type SourceRow = {
  id: string;
  owner_id: string;
  name: string;
  site_id: string | null;
  site_name: string | null;
  refresh_interval: number;
};
type SceneRow = {
  id: string;
  owner_id: string;
  name: string;
  data_source_id: string;
  visualization: 'departures-list';
};
type ScheduleRow = {
  id: string;
  owner_id: string;
  name: string;
  timezone: string;
};
type RuleRow = {
  id: string;
  schedule_id: string;
  days: string;
  start_time: string;
  end_time: string;
  scene_id: string;
};
type AssignmentRow = {
  display_id: string;
  kind: 'scene' | 'schedule';
  scene_id: string | null;
  schedule_id: string | null;
};
async function hydrateSources(
  db: D1Database,
  rows: SourceRow[],
): Promise<DataSourceRecord[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((row) => row.id);
  async function read(
    table: string,
    column: string,
  ): Promise<Map<string, string[]>> {
    const all = await allRows<{ data_source_id: string; value: string }>(
      db,
      'SELECT data_source_id,' +
        column +
        ' AS value FROM ' +
        table +
        ' WHERE data_source_id IN (' +
        ids.map(() => '?').join(',') +
        ') ORDER BY value',
      ids,
    );
    const map = new Map<string, string[]>();
    for (const row of all) {
      const values = map.get(row.data_source_id) ?? [];
      values.push(row.value);
      map.set(row.data_source_id, values);
    }
    return map;
  }
  const [lines, directions, modes] = await Promise.all([
    read('data_source_line_filters', 'line_number'),
    read('data_source_direction_filters', 'direction'),
    read('data_source_mode_filters', 'mode'),
  ]);
  return rows.map((row) => ({
    ...row,
    line_numbers: lines.get(row.id) ?? [],
    directions: directions.get(row.id) ?? [],
    modes: modes.get(row.id) ?? [],
  }));
}
function sourceParams(input: DataSourceInput): Array<string | number | null> {
  return [
    input.owner_id,
    input.name,
    input.site_id,
    input.site_name,
    input.refresh_interval,
  ];
}
function sourceFilters(id: string, input: DataSourceInput) {
  return [
    ...input.line_numbers.map((value) => ({
      sql: 'INSERT INTO data_source_line_filters(data_source_id,line_number) VALUES (?,?)',
      params: [id, value],
    })),
    ...input.directions.map((value) => ({
      sql: 'INSERT INTO data_source_direction_filters(data_source_id,direction) VALUES (?,?)',
      params: [id, value],
    })),
    ...input.modes.map((value) => ({
      sql: 'INSERT INTO data_source_mode_filters(data_source_id,mode) VALUES (?,?)',
      params: [id, value],
    })),
  ];
}
function clearSourceFilters(id: string) {
  return [
    'data_source_line_filters',
    'data_source_direction_filters',
    'data_source_mode_filters',
  ].map((table) => ({
    sql: 'DELETE FROM ' + table + ' WHERE data_source_id=?',
    params: [id],
  }));
}
async function validateScheduleReferences(
  store: SceneStore,
  input: ScheduleInput,
): Promise<void> {
  for (const sceneId of new Set(input.rules.map((rule) => rule.scene_id))) {
    if (!(await store.getScene(input.owner_id, sceneId)))
      invalid('A selected scene is not available for this owner.');
  }
}
async function validateAssignment(
  store: SceneStore,
  owner: string,
  input: DeviceAssignmentInput,
): Promise<void> {
  if (
    input.kind === 'scene' &&
    (!input.scene_id || !(await store.getScene(owner, input.scene_id)))
  )
    invalid('Scene is not available for this owner.');
  if (
    input.kind === 'schedule' &&
    (!input.schedule_id || !(await store.getSchedule(owner, input.schedule_id)))
  )
    invalid('Schedule is not available for this owner.');
}

export function createD1SceneStore(db: D1Database): SceneStore {
  const store: SceneStore = {
    async listSources(owner) {
      return hydrateSources(
        db,
        await allRows<SourceRow>(
          db,
          'SELECT * FROM data_sources WHERE owner_id=? ORDER BY name,id',
          [owner],
        ),
      );
    },
    async getSource(owner, id) {
      const row = await firstRow<SourceRow>(
        db,
        'SELECT * FROM data_sources WHERE id=? AND owner_id=?',
        [id, owner],
      );
      return row ? ((await hydrateSources(db, [row]))[0] ?? null) : null;
    },
    async saveSource(input, id) {
      if (id && !(await this.getSource(input.owner_id, id)))
        invalid('Data source not found for this owner.');
      id = id ?? crypto.randomUUID();
      await executeBatch(db, [
        {
          sql: 'INSERT INTO data_sources(id,owner_id,name,site_id,site_name,refresh_interval) VALUES (?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,site_id=excluded.site_id,site_name=excluded.site_name,refresh_interval=excluded.refresh_interval',
          params: [id, ...sourceParams(input)],
        },
        ...clearSourceFilters(id),
        ...sourceFilters(id, input),
      ]);
      const saved = await this.getSource(input.owner_id, id);
      if (!saved) throw new Error('Data source could not be loaded.');
      return saved;
    },
    async deleteSource(owner, id) {
      if (!(await this.getSource(owner, id))) return false;
      if (
        await firstRow<{ id: string }>(
          db,
          'SELECT id FROM scenes WHERE data_source_id=? LIMIT 1',
          [id],
        )
      )
        conflict('This stop is used by a scene. Remove the scene first.');
      await execute(db, {
        sql: 'DELETE FROM data_sources WHERE owner_id=? AND id=?',
        params: [owner, id],
      });
      return true;
    },
    async listScenes(owner) {
      return allRows<SceneRow>(
        db,
        'SELECT id,owner_id,name,data_source_id,visualization FROM scenes WHERE owner_id=? ORDER BY name,id',
        [owner],
      );
    },
    async getScene(owner, id) {
      return firstRow<SceneRow>(
        db,
        'SELECT id,owner_id,name,data_source_id,visualization FROM scenes WHERE owner_id=? AND id=?',
        [owner, id],
      );
    },
    async saveScene(input, id) {
      if (!(await this.getSource(input.owner_id, input.data_source_id)))
        invalid('Data source is not available for this owner.');
      if (id) {
        if (!(await this.getScene(input.owner_id, id)))
          invalid('Scene not found for this owner.');
        await execute(db, {
          sql: 'UPDATE scenes SET name=?,data_source_id=?,visualization=? WHERE id=? AND owner_id=?',
          params: [
            input.name,
            input.data_source_id,
            input.visualization,
            id,
            input.owner_id,
          ],
        });
      } else {
        id = crypto.randomUUID();
        await execute(db, {
          sql: 'INSERT INTO scenes(id,owner_id,name,data_source_id,visualization) VALUES (?,?,?,?,?)',
          params: [
            id,
            input.owner_id,
            input.name,
            input.data_source_id,
            input.visualization,
          ],
        });
      }
      const saved = await this.getScene(input.owner_id, id);
      if (!saved) throw new Error('Scene could not be loaded.');
      return saved;
    },
    async deleteScene(owner, id) {
      if (!(await this.getScene(owner, id))) return false;
      if (
        await firstRow<{ display_id: string }>(
          db,
          'SELECT display_id FROM device_assignments WHERE scene_id=? LIMIT 1',
          [id],
        )
      )
        conflict(
          'This scene is selected by a device. Change that device first.',
        );
      if (
        await firstRow<{ id: string }>(
          db,
          'SELECT id FROM schedule_rules WHERE scene_id=? LIMIT 1',
          [id],
        )
      )
        conflict(
          'This scene is used in a schedule. Remove those time windows first.',
        );
      await execute(db, {
        sql: 'DELETE FROM scenes WHERE owner_id=? AND id=?',
        params: [owner, id],
      });
      return true;
    },
    async listSchedules(owner) {
      const rows = await allRows<ScheduleRow>(
        db,
        'SELECT id,owner_id,name,timezone FROM schedules WHERE owner_id=? ORDER BY name,id',
        [owner],
      );
      if (!rows.length) return [];
      const all = await allRows<RuleRow>(
        db,
        'SELECT id,schedule_id,days,start_time,end_time,scene_id FROM schedule_rules WHERE schedule_id IN (' +
          rows.map(() => '?').join(',') +
          ') ORDER BY id',
        rows.map((row) => row.id),
      );
      return rows.map((row) => ({
        ...row,
        rules: all
          .filter((rule) => rule.schedule_id === row.id)
          .map((rule) => ({
            id: rule.id,
            days: JSON.parse(rule.days) as number[],
            start_time: rule.start_time,
            end_time: rule.end_time,
            scene_id: rule.scene_id,
          })),
      }));
    },
    async getSchedule(owner, id) {
      const row = await firstRow<ScheduleRow>(
        db,
        'SELECT id,owner_id,name,timezone FROM schedules WHERE owner_id=? AND id=?',
        [owner, id],
      );
      if (!row) return null;
      const rules = await allRows<RuleRow>(
        db,
        'SELECT * FROM schedule_rules WHERE schedule_id=? ORDER BY id',
        [id],
      );
      return {
        ...row,
        rules: rules.map((rule) => ({
          id: rule.id,
          days: JSON.parse(rule.days) as number[],
          start_time: rule.start_time,
          end_time: rule.end_time,
          scene_id: rule.scene_id,
        })),
      };
    },
    async saveSchedule(input, id) {
      await validateScheduleReferences(this, input);
      if (id && !(await this.getSchedule(input.owner_id, id)))
        invalid('Schedule not found for this owner.');
      id = id ?? crypto.randomUUID();
      await executeBatch(db, [
        {
          sql: 'INSERT INTO schedules(id,owner_id,name,timezone) VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,timezone=excluded.timezone',
          params: [id, input.owner_id, input.name, input.timezone],
        },
        { sql: 'DELETE FROM schedule_rules WHERE schedule_id=?', params: [id] },
        ...input.rules.map((rule) => ({
          sql: 'INSERT INTO schedule_rules(id,schedule_id,days,start_time,end_time,scene_id) VALUES (?,?,?,?,?,?)',
          params: [
            crypto.randomUUID(),
            id,
            JSON.stringify(rule.days),
            rule.start_time,
            rule.end_time,
            rule.scene_id,
          ],
        })),
      ]);
      const saved = await this.getSchedule(input.owner_id, id);
      if (!saved) throw new Error('Schedule could not be loaded.');
      return saved;
    },
    async deleteSchedule(owner, id) {
      if (!(await this.getSchedule(owner, id))) return false;
      if (
        await firstRow<{ display_id: string }>(
          db,
          'SELECT display_id FROM device_assignments WHERE schedule_id=? LIMIT 1',
          [id],
        )
      )
        conflict(
          'This schedule is in use. Switch the devices to a scene or another schedule first.',
        );
      await execute(db, {
        sql: 'DELETE FROM schedules WHERE id=? AND owner_id=?',
        params: [id, owner],
      });
      return true;
    },
    async getAssignment(displayId) {
      return firstRow<AssignmentRow>(
        db,
        'SELECT display_id,kind,scene_id,schedule_id FROM device_assignments WHERE display_id=?',
        [displayId],
      );
    },
    async saveAssignment(displayId, owner, input) {
      await validateAssignment(this, owner, input);
      await execute(db, {
        sql: "INSERT INTO device_assignments(display_id,kind,scene_id,schedule_id) VALUES (?,?,?,?) ON CONFLICT(display_id) DO UPDATE SET kind=excluded.kind,scene_id=excluded.scene_id,schedule_id=excluded.schedule_id,updated_at=datetime('now')",
        params: [displayId, input.kind, input.scene_id, input.schedule_id],
      });
      const saved = await this.getAssignment(displayId);
      if (!saved) throw new Error('Device assignment could not be loaded.');
      return saved;
    },
    async syncLegacy(display) {
      const source = legacySourceData(display);
      const sourceId = legacySource(display.id);
      const sceneId = legacyScene(display.id);
      await executeBatch(db, [
        {
          sql: 'INSERT INTO data_sources(id,owner_id,name,site_id,site_name,refresh_interval) VALUES (?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,site_id=excluded.site_id,site_name=excluded.site_name,refresh_interval=excluded.refresh_interval',
          params: [sourceId, ...sourceParams(source)],
        },
        ...clearSourceFilters(sourceId),
        ...sourceFilters(sourceId, source),
        {
          sql: 'INSERT OR IGNORE INTO scenes(id,owner_id,name,data_source_id,visualization) VALUES (?,?,?,?,?)',
          params: [
            sceneId,
            display.owner_id,
            display.name || 'Original display',
            sourceId,
            'departures-list',
          ],
        },
        {
          sql: "INSERT OR IGNORE INTO device_assignments(display_id,kind,scene_id,schedule_id) VALUES (?,'scene',?,NULL)",
          params: [display.id, sceneId],
        },
      ]);
    },
  };
  return store;
}

export function createMemorySceneStore(): SceneStore {
  const sources = new Map<string, DataSourceRecord>();
  const scenes = new Map<string, SceneRecord>();
  const schedules = new Map<string, ScheduleRecord>();
  const assignments = new Map<string, DeviceAssignment>();
  const store: SceneStore = {
    async listSources(owner) {
      return copy(
        [...sources.values()]
          .filter((item) => item.owner_id === owner)
          .sort((a, b) => a.name.localeCompare(b.name)),
      );
    },
    async getSource(owner, id) {
      const item = sources.get(id);
      return item?.owner_id === owner ? copy(item) : null;
    },
    async saveSource(input, id) {
      if (id && !(await this.getSource(input.owner_id, id)))
        invalid('Data source not found for this owner.');
      const item = { ...copy(input), id: id ?? crypto.randomUUID() };
      sources.set(item.id, item);
      return copy(item);
    },
    async deleteSource(owner, id) {
      if (!(await this.getSource(owner, id))) return false;
      if ([...scenes.values()].some((item) => item.data_source_id === id))
        conflict('This stop is used by a scene.');
      return sources.delete(id);
    },
    async listScenes(owner) {
      return copy(
        [...scenes.values()]
          .filter((item) => item.owner_id === owner)
          .sort((a, b) => a.name.localeCompare(b.name)),
      );
    },
    async getScene(owner, id) {
      const item = scenes.get(id);
      return item?.owner_id === owner ? copy(item) : null;
    },
    async saveScene(input, id) {
      if (!(await this.getSource(input.owner_id, input.data_source_id)))
        invalid('Data source is not available for this owner.');
      if (id && !(await this.getScene(input.owner_id, id)))
        invalid('Scene not found for this owner.');
      const item = { ...copy(input), id: id ?? crypto.randomUUID() };
      scenes.set(item.id, item);
      return copy(item);
    },
    async deleteScene(owner, id) {
      if (!(await this.getScene(owner, id))) return false;
      if ([...assignments.values()].some((item) => item.scene_id === id))
        conflict('Scene is assigned to a device.');
      if (
        [...schedules.values()].some((item) =>
          item.rules.some((rule) => rule.scene_id === id),
        )
      )
        conflict('Scene is used in a schedule.');
      return scenes.delete(id);
    },
    async listSchedules(owner) {
      return copy(
        [...schedules.values()]
          .filter((item) => item.owner_id === owner)
          .sort((a, b) => a.name.localeCompare(b.name)),
      );
    },
    async getSchedule(owner, id) {
      const item = schedules.get(id);
      return item?.owner_id === owner ? copy(item) : null;
    },
    async saveSchedule(input, id) {
      await validateScheduleReferences(this, input);
      if (id && !(await this.getSchedule(input.owner_id, id)))
        invalid('Schedule not found for this owner.');
      const item: ScheduleRecord = {
        id: id ?? crypto.randomUUID(),
        owner_id: input.owner_id,
        name: input.name,
        timezone: input.timezone,
        rules: input.rules.map((rule) => ({
          ...copy(rule),
          id: crypto.randomUUID(),
        })),
      };
      schedules.set(item.id, item);
      return copy(item);
    },
    async deleteSchedule(owner, id) {
      if (!(await this.getSchedule(owner, id))) return false;
      if ([...assignments.values()].some((item) => item.schedule_id === id))
        conflict('Schedule is assigned to a device.');
      return schedules.delete(id);
    },
    async getAssignment(displayId) {
      const item = assignments.get(displayId);
      return item ? copy(item) : null;
    },
    async saveAssignment(displayId, owner, input) {
      await validateAssignment(this, owner, input);
      const item = { display_id: displayId, ...copy(input) };
      assignments.set(displayId, item);
      return copy(item);
    },
    async syncLegacy(display) {
      const source = {
        id: legacySource(display.id),
        ...legacySourceData(display),
      };
      sources.set(source.id, source);
      const sceneId = legacyScene(display.id);
      if (!scenes.has(sceneId))
        scenes.set(sceneId, {
          id: sceneId,
          owner_id: display.owner_id,
          name: display.name || 'Original display',
          data_source_id: source.id,
          visualization: 'departures-list',
        });
      if (!assignments.has(display.id))
        assignments.set(display.id, {
          display_id: display.id,
          kind: 'scene',
          scene_id: sceneId,
          schedule_id: null,
        });
    },
  };
  return store;
}
