import { allRows, execute, executeBatch, firstRow } from './d1';
import { ApiError } from './errors';
import type { DisplayRecord } from './types';
import type {
  DataSourceInput, DataSourceRecord, PanelControl, PanelControlInput,
  PresentationInput, PresentationRecord, ScheduleRule,
} from './presentation-types';

export interface PresentationStore {
  listSources(owner: string): Promise<DataSourceRecord[]>;
  getSource(owner: string, id: string): Promise<DataSourceRecord | null>;
  saveSource(input: DataSourceInput, id?: string): Promise<DataSourceRecord>;
  deleteSource(owner: string, id: string): Promise<boolean>;
  listPresentations(owner: string): Promise<PresentationRecord[]>;
  getPresentation(owner: string, id: string): Promise<PresentationRecord | null>;
  savePresentation(input: PresentationInput, id?: string): Promise<PresentationRecord>;
  deletePresentation(owner: string, id: string): Promise<boolean>;
  getControl(displayId: string): Promise<PanelControl>;
  saveControl(displayId: string, owner: string, value: PanelControlInput): Promise<PanelControl>;
  syncLegacy(display: DisplayRecord): Promise<void>;
}
const legacySource = (id: string) => 'legacy-source:' + id;
const legacyPresentation = (id: string) => 'legacy-presentation:' + id;
const conflict = (message: string): never => { throw new ApiError(409, 'conflict', message); };
const invalid = (message: string): never => { throw new ApiError(400, 'validation_error', message); };
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const defaultControl = (id: string): PanelControl => ({
  display_id: id, timezone: 'Europe/Stockholm', default_presentation_id: null, manual: null, rules: [],
});
function legacySourceData(display: DisplayRecord): DataSourceInput {
  return {
    owner_id: display.owner_id, name: display.site_name || display.name || 'Existing stop',
    site_id: display.site_id, site_name: display.site_name,
    refresh_interval: display.refresh_interval, line_numbers: [...display.line_numbers],
    directions: [...display.directions], modes: [...display.modes],
  };
}
function legacyPresentationData(display: DisplayRecord): PresentationInput {
  return {
    owner_id: display.owner_id, name: display.name || 'Existing display',
    data_source_id: legacySource(display.id), visualization: 'departures-list',
  };
}
async function ensureReferences(store: PresentationStore, owner: string, value: PanelControlInput): Promise<void> {
  const ids = new Set<string>();
  if (value.default_presentation_id) ids.add(value.default_presentation_id);
  if (value.manual?.presentation_id) ids.add(value.manual.presentation_id);
  value.rules.forEach((rule) => { if (rule.presentation_id) ids.add(rule.presentation_id); });
  for (const id of ids) {
    if (!await store.getPresentation(owner, id)) invalid('Selected presentation is not available for this owner.');
  }
}
type SourceRow = {
  id: string; owner_id: string; name: string; site_id: string | null;
  site_name: string | null; refresh_interval: number;
  line_numbers: string; directions: string; modes: string;
};
function sourceFromRow(row: SourceRow): DataSourceRecord {
  return { ...row, line_numbers: JSON.parse(row.line_numbers) as string[],
    directions: JSON.parse(row.directions) as string[], modes: JSON.parse(row.modes) as string[] };
}
type ControlRow = { display_id: string; timezone: string; default_presentation_id: string | null;
  manual_mode: 'off' | 'presentation' | null; manual_presentation_id: string | null; manual_until: string | null };
type ScheduleRow = { id: string; display_id: string; days: string; start_time: string;
  end_time: string; mode: 'off' | 'presentation'; presentation_id: string | null };
function sourceParams(input: DataSourceInput): Array<string | number | null> {
  return [input.owner_id, input.name, input.site_id, input.site_name, input.refresh_interval,
    JSON.stringify(input.line_numbers), JSON.stringify(input.directions), JSON.stringify(input.modes)];
}
export function createD1PresentationStore(db: D1Database): PresentationStore {
  const store: PresentationStore = {
    async listSources(owner) {
      const rows = await allRows<SourceRow>(db, 'SELECT * FROM data_sources WHERE owner_id = ? ORDER BY name, id', [owner]);
      return rows.map(sourceFromRow);
    },
    async getSource(owner, id) {
      const row = await firstRow<SourceRow>(db, 'SELECT * FROM data_sources WHERE id = ? AND owner_id = ?', [id, owner]);
      return row ? sourceFromRow(row) : null;
    },
    async saveSource(input, id) {
      if (id) {
        if (!await this.getSource(input.owner_id, id)) invalid('Data source not found for this owner.');
        await execute(db, { sql: 'UPDATE data_sources SET name=?, site_id=?, site_name=?, refresh_interval=?, line_numbers=?, directions=?, modes=? WHERE id=? AND owner_id=?',
          params: [input.name, input.site_id, input.site_name, input.refresh_interval, JSON.stringify(input.line_numbers),
            JSON.stringify(input.directions), JSON.stringify(input.modes), id, input.owner_id] });
      } else {
        id = crypto.randomUUID();
        await execute(db, { sql: 'INSERT INTO data_sources (id,owner_id,name,site_id,site_name,refresh_interval,line_numbers,directions,modes) VALUES (?,?,?,?,?,?,?,?,?)',
          params: [id, ...sourceParams(input)] });
      }
      const saved = await this.getSource(input.owner_id, id);
      if (!saved) throw new Error('Source could not be loaded after saving.');
      return saved;
    },
    async deleteSource(owner, id) {
      if (!await this.getSource(owner, id)) return false;
      const used = await firstRow<{ id: string }>(db, 'SELECT id FROM presentations WHERE data_source_id=? LIMIT 1', [id]);
      if (used) conflict('This data source is used by a presentation. Remove that presentation first.');
      await execute(db, { sql: 'DELETE FROM data_sources WHERE id=? AND owner_id=?', params: [id, owner] });
      return true;
    },
    async listPresentations(owner) {
      return allRows<PresentationRecord>(db, 'SELECT id, owner_id, name, data_source_id, visualization FROM presentations WHERE owner_id=? ORDER BY name,id', [owner]);
    },
    async getPresentation(owner, id) {
      return firstRow<PresentationRecord>(db, 'SELECT id, owner_id, name, data_source_id, visualization FROM presentations WHERE owner_id=? AND id=?', [owner,id]);
    },
    async savePresentation(input, id) {
      if (!await this.getSource(input.owner_id, input.data_source_id)) invalid('Data source is not available for this owner.');
      if (id) {
        if (!await this.getPresentation(input.owner_id, id)) invalid('Presentation not found for this owner.');
        await execute(db, { sql: 'UPDATE presentations SET name=?, data_source_id=?, visualization=? WHERE id=? AND owner_id=?',
          params: [input.name, input.data_source_id, input.visualization, id, input.owner_id] });
      } else {
        id = crypto.randomUUID();
        await execute(db, { sql: 'INSERT INTO presentations (id,owner_id,name,data_source_id,visualization) VALUES (?,?,?,?,?)',
          params: [id,input.owner_id,input.name,input.data_source_id,input.visualization] });
      }
      const saved = await this.getPresentation(input.owner_id, id);
      if (!saved) throw new Error('Presentation could not be loaded after saving.');
      return saved;
    },
    async deletePresentation(owner, id) {
      if (!await this.getPresentation(owner, id)) return false;
      const used = await firstRow<{ display_id: string }>(db,
        'SELECT display_id FROM display_controls WHERE default_presentation_id=? OR manual_presentation_id=? LIMIT 1', [id,id]);
      const scheduled = await firstRow<{ id: string }>(db,
        'SELECT id FROM display_schedule_rules WHERE presentation_id=? LIMIT 1', [id]);
      if (used || scheduled) conflict('This presentation is assigned to a panel or schedule. Remove those references first.');
      await execute(db, { sql: 'DELETE FROM presentations WHERE id=? AND owner_id=?', params: [id, owner] });
      return true;
    },
    async getControl(displayId) {
      const row = await firstRow<ControlRow>(db, 'SELECT * FROM display_controls WHERE display_id=?', [displayId]);
      if (!row) return defaultControl(displayId);
      const rules = await allRows<ScheduleRow>(db,
        'SELECT * FROM display_schedule_rules WHERE display_id=? ORDER BY id', [displayId]);
      return {
        display_id: displayId, timezone: row.timezone, default_presentation_id: row.default_presentation_id,
        manual: row.manual_mode ? { mode: row.manual_mode, presentation_id: row.manual_presentation_id, until: row.manual_until } : null,
        rules: rules.map((rule) => ({
          id: rule.id, days: JSON.parse(rule.days) as number[], start_time: rule.start_time,
          end_time: rule.end_time, mode: rule.mode, presentation_id: rule.presentation_id,
        })),
      };
    },
    async saveControl(displayId, owner, value) {
      await ensureReferences(this, owner, value);
      const queries = [
        { sql: 'INSERT INTO display_controls (display_id,timezone,default_presentation_id,manual_mode,manual_presentation_id,manual_until) VALUES (?,?,?,?,?,?) ON CONFLICT(display_id) DO UPDATE SET timezone=excluded.timezone,default_presentation_id=excluded.default_presentation_id,manual_mode=excluded.manual_mode,manual_presentation_id=excluded.manual_presentation_id,manual_until=excluded.manual_until,updated_at=datetime(\'now\')',
          params: [displayId,value.timezone,value.default_presentation_id,value.manual?.mode ?? null,
            value.manual?.presentation_id ?? null,value.manual?.until ?? null] },
        { sql: 'DELETE FROM display_schedule_rules WHERE display_id=?', params: [displayId] },
        ...value.rules.map((rule) => ({
          sql: 'INSERT INTO display_schedule_rules (id,display_id,days,start_time,end_time,mode,presentation_id) VALUES (?,?,?,?,?,?,?)',
          params: [crypto.randomUUID(),displayId,JSON.stringify(rule.days),rule.start_time,rule.end_time,rule.mode,rule.presentation_id],
        })),
      ];
      await executeBatch(db, queries);
      return this.getControl(displayId);
    },
    async syncLegacy(display) {
      const source = legacySourceData(display);
      const presentation = legacyPresentationData(display);
      await executeBatch(db, [
        { sql: 'INSERT INTO data_sources (id,owner_id,name,site_id,site_name,refresh_interval,line_numbers,directions,modes) VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,site_id=excluded.site_id,site_name=excluded.site_name,refresh_interval=excluded.refresh_interval,line_numbers=excluded.line_numbers,directions=excluded.directions,modes=excluded.modes',
          params: [legacySource(display.id), ...sourceParams(source)] },
        { sql: 'INSERT OR IGNORE INTO presentations (id,owner_id,name,data_source_id,visualization) VALUES (?,?,?,?,?)',
          params: [legacyPresentation(display.id),presentation.owner_id,presentation.name,presentation.data_source_id,presentation.visualization] },
        { sql: 'INSERT OR IGNORE INTO display_controls (display_id,default_presentation_id) VALUES (?,?)',
          params: [display.id,legacyPresentation(display.id)] },
      ]);
    },
  };
  return store;
}

// Deterministic in-memory implementation for request and resolver tests.
export function createMemoryPresentationStore(): PresentationStore {
  const sources = new Map<string, DataSourceRecord>();
  const presentations = new Map<string, PresentationRecord>();
  const controls = new Map<string, PanelControl>();
  const store: PresentationStore = {
    async listSources(owner) { return copy([...sources.values()].filter((item) => item.owner_id === owner).sort((a,b) => a.name.localeCompare(b.name))); },
    async getSource(owner,id) {
      const result = sources.get(id);
      return result?.owner_id === owner ? copy(result) : null;
    },
    async saveSource(input,id) {
      if (id && !await this.getSource(input.owner_id,id)) invalid('Data source not found for this owner.');
      const item = { ...copy(input), id: id ?? crypto.randomUUID() };
      sources.set(item.id, item);
      return copy(item);
    },
    async deleteSource(owner,id) {
      if (!await this.getSource(owner,id)) return false;
      if ([...presentations.values()].some((item) => item.data_source_id === id)) conflict('This data source is used by a presentation.');
      return sources.delete(id);
    },
    async listPresentations(owner) { return copy([...presentations.values()].filter((item) => item.owner_id === owner).sort((a,b) => a.name.localeCompare(b.name))); },
    async getPresentation(owner,id) {
      const result = presentations.get(id);
      return result?.owner_id === owner ? copy(result) : null;
    },
    async savePresentation(input,id) {
      if (!await this.getSource(input.owner_id,input.data_source_id)) invalid('Data source is not available for this owner.');
      if (id && !await this.getPresentation(input.owner_id,id)) invalid('Presentation not found for this owner.');
      const item = { ...copy(input), id: id ?? crypto.randomUUID() };
      presentations.set(item.id, item);
      return copy(item);
    },
    async deletePresentation(owner,id) {
      if (!await this.getPresentation(owner,id)) return false;
      if ([...controls.values()].some((item) => item.default_presentation_id === id ||
        item.manual?.presentation_id === id || item.rules.some((rule) => rule.presentation_id === id)))
        conflict('Presentation is assigned to a panel or schedule.');
      return presentations.delete(id);
    },
    async getControl(displayId) { return copy(controls.get(displayId) ?? defaultControl(displayId)); },
    async saveControl(displayId,owner,value) {
      await ensureReferences(this,owner,value);
      const item: PanelControl = {
        display_id: displayId, ...copy(value),
        rules: value.rules.map((rule) => ({ ...copy(rule), id: crypto.randomUUID() })),
      };
      controls.set(displayId,item);
      return copy(item);
    },
    async syncLegacy(display) {
      const src = { ...legacySourceData(display), id: legacySource(display.id) };
      sources.set(src.id,src);
      const id = legacyPresentation(display.id);
      if (!presentations.has(id)) presentations.set(id,{ ...legacyPresentationData(display),id });
      if (!controls.has(display.id)) controls.set(display.id,{
        ...defaultControl(display.id),default_presentation_id:id,
      });
    },
  };
  return store;
}
