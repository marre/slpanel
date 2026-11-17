import { describe, expect, it } from 'vitest';
import type { DataSourceRecord, SceneRecord } from '@/api/scene-types';
import type { DepartureRecord } from '@/api/types';
import { directionOptions, lineOptions, sourceSaveDecision } from './scene-editor';

const departure = (line_number: string, destination: string, transport_mode: string) =>
  ({ line_number, destination, transport_mode }) as DepartureRecord;
const original: DataSourceRecord = {
  id: 'source-one', owner_id: 'Ab12Cd34', name: 'Stop',
  site_id: '9192', site_name: 'Slussen', refresh_interval: 30,
  line_numbers: ['17'], directions: ['Hagsätra'], modes: ['METRO'],
};
const scenes: SceneRecord[] = [
  { id: 'scene-one', owner_id: 'Ab12Cd34', name: 'Morning', data_source_id: original.id, visualization: 'departures-list' },
  { id: 'scene-two', owner_id: 'Ab12Cd34', name: 'Evening', data_source_id: original.id, visualization: 'departures-list' },
];

describe('scene editor helpers', () => {
  it('filters line suggestions by transport mode and direction suggestions by selected line', () => {
    const departures = [
      departure('17', 'Hagsätra', 'METRO'),
      departure('18', 'Farsta', 'METRO'),
      departure('4', 'Radiohuset', 'BUS'),
      departure('17', 'Hagsätra', 'METRO'),
    ];
    expect(lineOptions(departures, ['BUS']).map((option) => option.value)).toEqual(['4']);
    expect(lineOptions(departures, ['METRO']).map((option) => option.value)).toEqual(['17', '18']);
    expect(directionOptions(departures, ['17'], ['METRO']).map((option) => option.value)).toEqual(['Hagsätra']);
    expect(directionOptions(departures, [], ['BUS']).map((option) => option.value)).toEqual(['Radiohuset']);
  });

  it('reuses unchanged sources and copies changed sources when shared', () => {
    expect(sourceSaveDecision(original, scenes, 'scene-one', { ...original })).toEqual({
      save: false, updateId: original.id,
    });
    expect(sourceSaveDecision(original, scenes, 'scene-one', { ...original, site_id: '1000' })).toEqual({
      save: true,
    });
    expect(sourceSaveDecision(original, scenes.slice(0, 1), 'scene-one', { ...original, site_id: '1000' })).toEqual({
      save: true, updateId: original.id,
    });
    expect(sourceSaveDecision(undefined, [], null, { ...original })).toEqual({ save: true });
  });
});
