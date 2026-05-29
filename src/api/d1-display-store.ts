import { execute, executeBatch, firstRow, allRows } from './d1';
import { composeDisplayResourceId, generateDisplayId } from './id';
import type { DisplayStore } from './display-store';
import type { DisplayRecord } from './types';

type DisplayBaseRow = {
  id: string;
  owner_id: string;
  display_id: string;
  name: string;
  site_id: string | null;
  site_name: string | null;
  refresh_interval: number;
};

type FilterTable =
  | 'display_line_filters'
  | 'display_direction_filters'
  | 'display_mode_filters';
type FilterColumn = 'line_number' | 'direction' | 'mode';

export function createD1DisplayStore(db: D1Database): DisplayStore {
  return {
    async listByOwner(ownerId) {
      const rows = await allRows<DisplayBaseRow>(
        db,
        `SELECT id, owner_id, display_id, name, site_id, site_name, refresh_interval
         FROM displays
         WHERE owner_id = ?
         ORDER BY created_at ASC, id ASC`,
        [ownerId],
      );

      return hydrateDisplays(db, rows);
    },

    async getById(id) {
      const row = await firstRow<DisplayBaseRow>(
        db,
        `SELECT id, owner_id, display_id, name, site_id, site_name, refresh_interval
         FROM displays
         WHERE id = ?`,
        [id],
      );

      if (!row) {
        return null;
      }

      const [display] = await hydrateDisplays(db, [row]);

      return display ?? null;
    },

    async create(input) {
      const displayId = generateDisplayId();
      const resourceId = composeDisplayResourceId(input.owner_id, displayId);

      await executeBatch(db, [
        {
          sql: 'INSERT OR IGNORE INTO owners (id) VALUES (?)',
          params: [input.owner_id],
        },
        {
          sql: `INSERT INTO displays (
                  id,
                  owner_id,
                  display_id,
                  name,
                  site_id,
                  site_name,
                  refresh_interval
                ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          params: [
            resourceId,
            input.owner_id,
            displayId,
            input.name,
            input.site_id,
            input.site_name,
            input.refresh_interval,
          ],
        },
        ...buildFilterInsertQueries(resourceId, input),
      ]);

      const created = await this.getById(resourceId);

      if (!created) {
        throw new Error('Display could not be reloaded after creation.');
      }

      return created;
    },

    async update(id, input) {
      const current = await this.getById(id);

      if (!current) {
        return null;
      }

      let siteId = input.site_id ?? current.site_id;
      let siteName = input.site_name ?? current.site_name;

      if (input.site_id === null) {
        siteId = null;
        siteName = input.site_name === undefined ? null : siteName;
      }

      const next: DisplayRecord = {
        ...current,
        name: input.name ?? current.name,
        site_id: siteId,
        site_name: siteName,
        refresh_interval: input.refresh_interval ?? current.refresh_interval,
        line_numbers: input.line_numbers ?? current.line_numbers,
        directions: input.directions ?? current.directions,
        modes: input.modes ?? current.modes,
      };

      await executeBatch(db, [
        {
          sql: `UPDATE displays
                SET name = ?,
                    site_id = ?,
                    site_name = ?,
                    refresh_interval = ?,
                    updated_at = datetime('now')
                WHERE id = ?`,
          params: [
            next.name,
            next.site_id,
            next.site_name,
            next.refresh_interval,
            id,
          ],
        },
        {
          sql: 'DELETE FROM display_line_filters WHERE display_id = ?',
          params: [id],
        },
        {
          sql: 'DELETE FROM display_direction_filters WHERE display_id = ?',
          params: [id],
        },
        {
          sql: 'DELETE FROM display_mode_filters WHERE display_id = ?',
          params: [id],
        },
        ...buildFilterInsertQueries(id, next),
      ]);

      return this.getById(id);
    },

    async delete(id) {
      const existing = await this.getById(id);

      if (!existing) {
        return false;
      }

      await execute(db, {
        sql: 'DELETE FROM displays WHERE id = ?',
        params: [id],
      });

      return true;
    },
  };
}

function buildFilterInsertQueries(
  displayId: string,
  input: Pick<DisplayRecord, 'line_numbers' | 'directions' | 'modes'>,
) {
  return [
    ...input.line_numbers.map((lineNumber) => ({
      sql: 'INSERT INTO display_line_filters (display_id, line_number) VALUES (?, ?)',
      params: [displayId, lineNumber],
    })),
    ...input.directions.map((direction) => ({
      sql: 'INSERT INTO display_direction_filters (display_id, direction) VALUES (?, ?)',
      params: [displayId, direction],
    })),
    ...input.modes.map((mode) => ({
      sql: 'INSERT INTO display_mode_filters (display_id, mode) VALUES (?, ?)',
      params: [displayId, mode],
    })),
  ];
}

async function hydrateDisplays(
  db: D1Database,
  rows: DisplayBaseRow[],
): Promise<DisplayRecord[]> {
  const ids = rows.map((row) => row.id);
  const [lineNumbers, directions, modes] = await Promise.all([
    loadFilters(db, ids, 'display_line_filters', 'line_number'),
    loadFilters(db, ids, 'display_direction_filters', 'direction'),
    loadFilters(db, ids, 'display_mode_filters', 'mode'),
  ]);

  return rows.map((row) => ({
    ...row,
    line_numbers: lineNumbers.get(row.id) ?? [],
    directions: directions.get(row.id) ?? [],
    modes: modes.get(row.id) ?? [],
  }));
}

async function loadFilters(
  db: D1Database,
  displayIds: string[],
  table: FilterTable,
  column: FilterColumn,
): Promise<Map<string, string[]>> {
  if (displayIds.length === 0) {
    return new Map();
  }

  const placeholders = displayIds.map(() => '?').join(', ');
  const rows = await allRows<{ display_id: string; value: string }>(
    db,
    `SELECT display_id, ${column} AS value
     FROM ${table}
     WHERE display_id IN (${placeholders})
     ORDER BY value ASC`,
    displayIds,
  );

  return rows.reduce((map, row) => {
    const values = map.get(row.display_id) ?? [];
    values.push(row.value);
    map.set(row.display_id, values);
    return map;
  }, new Map<string, string[]>());
}
