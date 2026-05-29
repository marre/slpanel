import { composeDisplayResourceId, generateDisplayId } from './id';
import type { DisplayStore } from './display-store';
import type { DisplayRecord } from './types';

export function createMemoryDisplayStore(
  initialDisplays: DisplayRecord[] = [],
): DisplayStore {
  const displays = new Map(
    initialDisplays.map((display) => [display.id, cloneDisplay(display)]),
  );

  return {
    async listByOwner(ownerId) {
      return Array.from(displays.values())
        .filter((display) => display.owner_id === ownerId)
        .sort((left, right) => left.id.localeCompare(right.id))
        .map(cloneDisplay);
    },

    async getById(id) {
      const display = displays.get(id);
      return display ? cloneDisplay(display) : null;
    },

    async create(input) {
      const displayId = generateDisplayId();
      const record: DisplayRecord = {
        id: composeDisplayResourceId(input.owner_id, displayId),
        owner_id: input.owner_id,
        display_id: displayId,
        name: input.name,
        site_id: input.site_id,
        site_name: input.site_name,
        refresh_interval: input.refresh_interval,
        line_numbers: [...input.line_numbers],
        directions: [...input.directions],
        modes: [...input.modes],
      };

      displays.set(record.id, record);

      return cloneDisplay(record);
    },

    async update(id, input) {
      const current = displays.get(id);

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

      displays.set(id, cloneDisplay(next));

      return cloneDisplay(next);
    },

    async delete(id) {
      return displays.delete(id);
    },
  };
}

function cloneDisplay(display: DisplayRecord): DisplayRecord {
  return {
    ...display,
    line_numbers: [...display.line_numbers],
    directions: [...display.directions],
    modes: [...display.modes],
  };
}
