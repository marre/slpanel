import { describe, expect, it } from 'vitest';
import { createApp } from './app';
import { createMemoryDisplayStore } from './memory-display-store';
import { createMemorySceneStore } from './scene-store';

const OWNER = 'aB3xZ9kQ';
const json = (value: unknown, method: 'POST' | 'PUT' = 'POST') => ({
  method,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(value),
});
describe('scene and shared schedule API', () => {
  it('reuses one schedule across devices and returns a flat firmware-compatible config', async () => {
    const displays = createMemoryDisplayStore();
    const store = createMemorySceneStore();
    let clock = new Date('2026-11-16T07:15:00Z');
    const app = createApp({
      createDisplayStore: () => displays,
      createSceneStore: () => store,
      now: () => clock,
    });
    const create = async (name: string) => {
      const response = await app.request(
        '/api/displays',
        json({
          owner_id: OWNER,
          name,
          site_id: null,
          site_name: null,
          refresh_interval: 30,
          line_numbers: [],
          directions: [],
          modes: [],
        }),
      );
      expect(response.status).toBe(201);
      return ((await response.json()) as { display: { id: string } }).display
        .id;
    };
    const first = await create('Hallway');
    const second = await create('Kitchen');
    const sourceResult = await app.request(
      '/api/data-sources',
      json({
        owner_id: OWNER,
        name: 'Slussen',
        site_id: '9192',
        site_name: 'Slussen',
        refresh_interval: 30,
        line_numbers: ['17'],
        directions: [],
        modes: ['metro'],
      }),
    );
    expect(sourceResult.status).toBe(201);
    const source = (
      (await sourceResult.json()) as { data_source: { id: string } }
    ).data_source;
    const sceneResult = await app.request(
      '/api/scenes',
      json({
        owner_id: OWNER,
        name: 'Morning',
        data_source_id: source.id,
        visualization: 'departures-list',
      }),
    );
    expect(sceneResult.status).toBe(201);
    const scene = ((await sceneResult.json()) as { scene: { id: string } })
      .scene;
    const scheduleResult = await app.request(
      '/api/schedules',
      json({
        owner_id: OWNER,
        name: 'Workdays',
        timezone: 'Europe/Stockholm',
        rules: [
          {
            days: [0, 1, 2, 3, 4],
            start_time: '06:00',
            end_time: '09:00',
            scene_id: scene.id,
          },
        ],
      }),
    );
    expect(scheduleResult.status).toBe(201);
    const schedule = (
      (await scheduleResult.json()) as { schedule: { id: string } }
    ).schedule;
    for (const deviceId of [first, second]) {
      const assign = await app.request(
        '/api/displays/' + deviceId + '/assignment',
        json(
          { kind: 'schedule', scene_id: null, schedule_id: schedule.id },
          'PUT',
        ),
      );
      expect(assign.status).toBe(200);
      const device = await app.request('/api/displays/' + deviceId);
      const payload = (await device.json()) as {
        display: {
          id: string;
          site_id: string | null;
          line_numbers: string[];
          modes: string[];
        };
        effective: {
          mode: string;
          scene: { id: string };
          reason: string;
          next_transition_at: string | null;
        };
      };
      expect(payload.display.id).toBe(deviceId);
      expect(payload.display.site_id).toBe('9192');
      expect(payload.display.line_numbers).toEqual(['17']);
      expect(payload.display.modes).toEqual(['METRO']);
      expect(payload.effective.scene.id).toBe(scene.id);
      expect(payload.effective.reason).toBe('schedule');
      expect(device.headers.get('Cache-Control')).toBe('no-store');
    }
    clock = new Date('2026-11-16T13:00:00Z');
    for (const deviceId of [first, second]) {
      const response = await app.request('/api/displays/' + deviceId);
      const result = (await response.json()) as {
        display: { site_id: string | null };
        effective: { mode: string; scene: null };
      };
      expect(result.display.site_id).toBeNull();
      expect(result.effective.mode).toBe('off');
      expect(result.effective.scene).toBeNull();
    }
    const deleteInUse = await app.request(
      '/api/schedules/' + schedule.id + '?owner=' + OWNER,
      { method: 'DELETE' },
    );
    expect(deleteInUse.status).toBe(409);
    const foreignSource = await app.request(
      '/api/scenes',
      json({
        owner_id: 'fF4eD0xA',
        name: 'Wrong owner',
        data_source_id: source.id,
        visualization: 'departures-list',
      }),
    );
    expect(foreignSource.status).toBe(400);
  });
  it('migrates a legacy device to a fixed scene and preserves stable IDs', async () => {
    const displays = createMemoryDisplayStore();
    const store = createMemorySceneStore();
    const app = createApp({
      createDisplayStore: () => displays,
      createSceneStore: () => store,
    });
    const response = await app.request(
      '/api/displays',
      json({
        owner_id: OWNER,
        name: 'Original',
        site_id: '1011',
        site_name: 'Slussen',
        refresh_interval: 45,
        line_numbers: ['18'],
        directions: [],
        modes: [],
      }),
    );
    const display = ((await response.json()) as { display: { id: string } })
      .display;
    const assignment = await app.request(
      '/api/displays/' + display.id + '/assignment',
    );
    const data = (await assignment.json()) as {
      assignment: { kind: string; scene_id: string };
      effective: { mode: string };
    };
    expect(data.assignment.kind).toBe('scene');
    expect(data.assignment.scene_id).toContain('legacy-scene:');
    expect(data.effective.mode).toBe('scene');
  });
  it('does not overwrite edited scene data when a migrated device is renamed', async () => {
    const displays = createMemoryDisplayStore();
    const scenes = createMemorySceneStore();
    const app = createApp({
      createDisplayStore: () => displays,
      createSceneStore: () => scenes,
    });

    const created = await app.request(
      '/api/displays',
      json({
        owner_id: OWNER,
        name: 'Hallway',
        site_id: '1011',
        site_name: 'Original stop',
        refresh_interval: 30,
        line_numbers: ['17'],
        directions: [],
        modes: ['METRO'],
      }),
    );
    expect(created.status).toBe(201);
    const display = (await created.json()) as { display: { id: string } };
    const id = display.display.id;
    const sourceId = 'legacy-source:' + id;

    const editedSource = await app.request(
      '/api/data-sources/' + encodeURIComponent(sourceId),
      json({
        owner_id: OWNER,
        name: 'Edited source',
        site_id: '9192',
        site_name: 'Updated stop',
        refresh_interval: 60,
        line_numbers: ['18'],
        directions: ['Northbound'],
        modes: ['BUS'],
      }, 'PUT'),
    );
    expect(editedSource.status).toBe(200);

    const renamed = await app.request(
      '/api/displays/' + encodeURIComponent(id),
      json({ name: 'Renamed hallway' }, 'PUT'),
    );
    expect(renamed.status).toBe(200);
    const sourceAfterRename = await scenes.getSource(OWNER, sourceId);
    expect(sourceAfterRename).toMatchObject({
      name: 'Edited source',
      site_id: '9192',
      site_name: 'Updated stop',
      refresh_interval: 60,
      line_numbers: ['18'],
      directions: ['Northbound'],
      modes: ['BUS'],
    });
    const effective = await app.request('/api/displays/' + encodeURIComponent(id));
    const effectiveBody = (await effective.json()) as {
      display: { name: string; site_id: string | null };
    };
    expect(effectiveBody.display.name).toBe('Renamed hallway');
    expect(effectiveBody.display.site_id).toBe('9192');

    // Legacy firmware configuration edits still intentionally sync its
    // compatibility stop/filter fields into the imported reusable source.
    const legacyUpdate = await app.request(
      '/api/displays/' + encodeURIComponent(id),
      json({ site_id: '2022', site_name: 'Legacy update', line_numbers: ['21'] }, 'PUT'),
    );
    expect(legacyUpdate.status).toBe(200);
    expect(await scenes.getSource(OWNER, sourceId)).toMatchObject({
      site_id: '2022',
      site_name: 'Legacy update',
      line_numbers: ['21'],
    });
  });

});
