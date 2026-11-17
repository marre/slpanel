import type {
  DataSourceInput,
  DataSourceRecord,
  SceneRecord,
} from '@/api/scene-types';
import type { DepartureRecord } from '@/api/types';

type FilterOption = {
  value: string;
  label: string;
  transportMode: string;
  lineNumber?: string;
};

export const transportModeOptions: FilterOption[] = [
  { value: 'BUS', label: 'Bus', transportMode: '' },
  { value: 'METRO', label: 'Metro', transportMode: '' },
  { value: 'TRAM', label: 'Tram', transportMode: '' },
  { value: 'TRAIN', label: 'Train', transportMode: '' },
  { value: 'SHIP', label: 'Ferry', transportMode: '' },
];

export function lineOptions(
  departures: DepartureRecord[],
  modes: string[],
): FilterOption[] {
  const seen = new Map<string, Set<string>>();
  for (const departure of departures) {
    if (modes.length && !modes.includes(departure.transport_mode)) continue;
    if (!seen.has(departure.line_number)) {
      seen.set(departure.line_number, new Set());
    }
    seen.get(departure.line_number)!.add(departure.transport_mode);
  }
  return [...seen.entries()]
    .map(([value, types]) => ({
      value,
      label: value,
      transportMode: [...types].join(', '),
    }))
    .sort((a, b) =>
      a.value.localeCompare(b.value, undefined, { numeric: true }),
    );
}

export function directionOptions(
  departures: DepartureRecord[],
  lines: string[],
  modes: string[],
): FilterOption[] {
  const seen = new Map<
    string,
    { lineNumber: string; transportMode: string }
  >();
  for (const departure of departures) {
    if (modes.length && !modes.includes(departure.transport_mode)) continue;
    if (lines.length && !lines.includes(departure.line_number)) continue;
    if (!seen.has(departure.destination)) {
      seen.set(departure.destination, {
        lineNumber: departure.line_number,
        transportMode: departure.transport_mode,
      });
    }
  }
  return [...seen.entries()]
    .map(([value, info]) => ({ value, label: value, ...info }))
    .sort((a, b) => a.value.localeCompare(b.value, 'sv'));
}

function equalValues(a: string[], b: string[]) {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

export function sourceSaveDecision(
  current: DataSourceRecord | undefined,
  scenes: SceneRecord[],
  sceneId: string | null,
  draft: DataSourceInput,
): { save: boolean; updateId?: string } {
  if (!current) return { save: true };
  if (
    current.owner_id === draft.owner_id &&
    current.name === draft.name &&
    current.site_id === draft.site_id &&
    current.site_name === draft.site_name &&
    current.refresh_interval === draft.refresh_interval &&
    equalValues(current.line_numbers, draft.line_numbers) &&
    equalValues(current.directions, draft.directions) &&
    equalValues(current.modes, draft.modes)
  ) {
    return { save: false, updateId: current.id };
  }

  // Do not overwrite configuration used by another scene.
  if (
    scenes.some(
      (scene) => scene.id !== sceneId && scene.data_source_id === current.id,
    )
  ) {
    return { save: true };
  }
  return { save: true, updateId: current.id };
}
