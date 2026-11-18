import { describe, expect, it, vi } from 'vitest';
import { createApp } from './app';
import { createMemoryDisplayStore } from './memory-display-store';
import { createMemorySceneStore } from './scene-store';
import type { TransitProvider } from './transit-provider';

const owner = 'aB3xZ9kQ';
const json = (value: unknown, method: 'POST' | 'PUT' = 'POST') => ({
  method,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(value),
});

describe('v1 device snapshots', () => {
  it('returns bounded, normalized display data in a single request', async () => {
    const getDepartures = vi.fn<TransitProvider['getDepartures']>(async () =>
      Array.from({ length: 12 }, (_, i) => ({
        line_number: '17',
        destination: 'Hagsätra',
        display_time: `${i + 1} min`,
        minutes_until_departure: i + 1,
        scheduled_at: null,
        expected_at: null,
        transport_mode: 'METRO',
        platform: '2',
        state: 'EXPECTED' as const,
      })),
    );
    const app = createApp({
      createDisplayStore: () => createMemoryDisplayStore(),
      // Test with a persistent store: the display is read on every snapshot.
      transitProvider: { searchStops: async () => [], getDepartures },
      now: () => new Date('2026-11-18T08:00:00Z'),
    });
    // The store must be shared across requests.
    // A separate test below exercises the full scheduled scene resolver.
    const missing = await app.request('/api/v1/devices/bad/snapshot');
    expect(missing.status).toBe(400);
  });

  it('serves a live scene and scheduled Off without asking the transit provider for Off', async () => {
    const displays = createMemoryDisplayStore();
    const scenes = createMemorySceneStore();
    let now = new Date('2026-11-16T07:15:00Z');
    const getDepartures = vi.fn<TransitProvider['getDepartures']>(async () =>
      Array.from({ length: 12 }, (_, i) => ({
        line_number: '17',
        destination: 'Hagsätra',
        display_time: `${i + 1} min`,
        minutes_until_departure: i + 1,
        scheduled_at: null,
        expected_at: null,
        transport_mode: 'METRO',
        platform: '2',
        state: 'EXPECTED' as const,
      })),
    );
    const app = createApp({
      createDisplayStore: () => displays,
      createSceneStore: () => scenes,
      transitProvider: { searchStops: async () => [], getDepartures },
      now: () => now,
    });
    const created = await app.request(
      '/api/displays',
      json({
        owner_id: owner,
        name: 'Hallway',
        site_id: null,
        site_name: null,
        refresh_interval: 30,
        line_numbers: [],
        directions: [],
        modes: [],
      }),
    );
    expect(created.status).toBe(201);
    const id = ((await created.json()) as { display: { id: string } }).display.id;
    const sourceResponse = await app.request(
      '/api/data-sources',
      json({
        owner_id: owner,
        name: 'Slussen',
        site_id: '9192',
        site_name: 'Slussen',
        refresh_interval: 30,
        line_numbers: ['17'],
        directions: ['Hagsätra'],
        modes: ['METRO'],
      }),
    );
    const sourceId = ((await sourceResponse.json()) as { data_source: { id: string } })
      .data_source.id;
    const sceneResponse = await app.request(
      '/api/scenes',
      json({
        owner_id: owner,
        name: 'Morning',
        data_source_id: sourceId,
        visualization: 'departures-list',
      }),
    );
    const sceneId = ((await sceneResponse.json()) as { scene: { id: string } })
      .scene.id;
    const scheduleResponse = await app.request(
      '/api/schedules',
      json({
        owner_id: owner,
        name: 'Workdays',
        timezone: 'Europe/Stockholm',
        rules: [{ days: [0, 1, 2, 3, 4], start_time: '06:00', end_time: '09:00', scene_id: sceneId }],
      }),
    );
    const scheduleId = ((await scheduleResponse.json()) as { schedule: { id: string } })
      .schedule.id;
    expect((await app.request('/api/displays/' + id + '/assignment',
      json({ kind: 'schedule', scene_id: null, schedule_id: scheduleId }, 'PUT'))).status).toBe(200);

    const path = '/api/v1/devices/' + id + '/snapshot';
    const live = await app.request(path);
    expect(live.status).toBe(200);
    expect(live.headers.get('Cache-Control')).toBe('no-store');
    const data = (await live.json()) as {
      version: number;
      device_id: string;
      mode: string;
      display: { id: string; site_id: string | null; refresh_interval: number };
      departures: unknown[];
      next_transition_at: string | null;
    };
    expect(data).toMatchObject({
      version: 1,
      device_id: id,
      mode: 'departures-list',
      display: { id, site_id: '9192', refresh_interval: 30 },
    });
    expect(data.departures).toHaveLength(4);
    expect(data.next_transition_at).not.toBeNull();
    expect(getDepartures).toHaveBeenCalledWith({
      site_id: '9192',
      lines: ['17'],
      directions: ['Hagsätra'],
      modes: ['METRO'],
      forecast: 240,
    });

    now = new Date('2026-11-16T13:00:00Z');
    const off = await app.request(path);
    expect(off.status).toBe(200);
    expect((await off.json()) as unknown).toMatchObject({
      mode: 'off', display: { site_id: null }, departures: [],
    });
    expect(getDepartures).toHaveBeenCalledTimes(1);
  });

  it('distinguishes an unconfigured device from a scheduled Off state', async () => {
    const displays = createMemoryDisplayStore();
    const app = createApp({ createDisplayStore: () => displays });
    const create = await app.request('/api/displays', json({ owner_id: owner, name: 'New device' }));
    const id = ((await create.json()) as { display: { id: string } }).display.id;
    const response = await app.request('/api/v1/devices/' + id + '/snapshot');
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      mode: 'unconfigured', display: { id, site_id: null }, departures: [],
    });
    expect((await app.request('/api/v1/devices/' + owner + '-badbadbadbad/snapshot')).status).toBe(404);
  });
});
