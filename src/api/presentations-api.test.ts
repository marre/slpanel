import { describe, expect, it } from 'vitest';
import { createApp } from './app';
import { createMemoryDisplayStore } from './memory-display-store';
import { createMemoryPresentationStore } from './presentation-store';

const OWNER = 'aB3xZ9kQ';
const OTHER = 'bC4yA0mR';
const json = (body: unknown) => ({
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
});
describe('reusable presentations API', () => {
  it('migrates new displays, selects a new stop, and exposes a backwards-compatible device config', async () => {
    const displays = createMemoryDisplayStore();
    const store = createMemoryPresentationStore();
    let instant = new Date('2026-11-16T07:00:00Z');
    const app = createApp({
      createDisplayStore: () => displays, createPresentationStore: () => store, now: () => instant,
    });
    const created = await app.request('/api/displays', json({
      owner_id: OWNER, name: 'Hallway', site_id: '9192', site_name: 'Slussen',
      refresh_interval: 30, line_numbers: ['17'], directions: [], modes: [],
    }));
    expect(created.status).toBe(201);
    const display = (await created.json() as { display: { id: string } }).display;
    const initial = await app.request('/api/displays/' + display.id);
    expect((await initial.json() as { display: { site_id: string } }).display.site_id).toBe('9192');
    const existingSources = await store.listSources(OWNER);
    expect(existingSources).toHaveLength(1);
    expect(existingSources[0].line_numbers).toEqual(['17']);

    const sourceResponse = await app.request('/api/data-sources', json({
      owner_id: OWNER, name: 'Huddinge', site_id: '1002', site_name: 'Huddinge',
      refresh_interval: 45, line_numbers: ['1'], directions: [], modes: ['train'],
    }));
    expect(sourceResponse.status).toBe(201);
    const source = (await sourceResponse.json() as { data_source: { id: string; modes: string[] } }).data_source;
    expect(source.modes).toEqual(['TRAIN']);
    const profileResponse = await app.request('/api/presentations', json({
      owner_id: OWNER, name: 'Commute', data_source_id: source.id,
      visualization: 'departures-list',
    }));
    const profile = (await profileResponse.json() as { presentation: { id: string } }).presentation;
    const put = await app.request('/api/displays/' + display.id + '/control', {
      method: 'PUT', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        timezone: 'Europe/Stockholm', default_presentation_id: profile.id, manual: null,
        rules: [{
          days: [0], start_time: '22:00', end_time: '06:00',
          mode: 'off', presentation_id: null,
        }],
      }),
    });
    expect(put.status).toBe(200);
    const effective = await app.request('/api/displays/' + display.id);
    const payload = await effective.json() as {
      display: { id: string; site_id: string | null; line_numbers: string[] };
      effective: { mode: string; reason: string; presentation: { id: string } };
    };
    expect(payload.display.id).toBe(display.id);
    expect(payload.display.site_id).toBe('1002');
    expect(payload.display.line_numbers).toEqual(['1']);
    expect(payload.effective.mode).toBe('presentation');
    expect(payload.effective.presentation.id).toBe(profile.id);

    instant = new Date('2026-11-16T22:20:00Z');
    const off = await app.request('/api/displays/' + display.id);
    const offPayload = await off.json() as {
      display: { site_id: string | null }; effective: { mode: string };
    };
    expect(offPayload.effective.mode).toBe('off');
    expect(offPayload.display.site_id).toBeNull();
    expect(off.headers.get('Cache-Control')).toBe('no-store');

    const deleted = await app.request('/api/presentations/' + profile.id + '?owner=' + OWNER, { method: 'DELETE' });
    expect(deleted.status).toBe(409);
    const notOwner = await app.request('/api/presentations', json({
      owner_id: OTHER, name: 'Intruder', data_source_id: source.id,
      visualization: 'departures-list',
    }));
    expect(notOwner.status).toBe(400);
  });
  it('supports manual overrides and rejects unsupported renderers', async () => {
    const displays = createMemoryDisplayStore();
    const store = createMemoryPresentationStore();
    const app = createApp({
      createDisplayStore: () => displays, createPresentationStore: () => store,
    });
    const created = await app.request('/api/displays', json({
      owner_id: OWNER, name: 'Kitchen', site_id: '1011', site_name: 'Slussen',
      refresh_interval: 30, line_numbers: [], directions: [], modes: [],
    }));
    const id = (await created.json() as { display: { id: string } }).display.id;
    const invalid = await app.request('/api/presentations', json({
      owner_id: OWNER, name: 'Unsupported', data_source_id: 'x', visualization: 'countdown',
    }));
    expect(invalid.status).toBe(400);
    const profile = (await store.listPresentations(OWNER))[0];
    const put = await app.request('/api/displays/' + id + '/control', {
      method: 'PUT', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        timezone: 'Europe/Stockholm', default_presentation_id: profile.id,
        manual: { mode: 'off', presentation_id: null, until: null }, rules: [],
      }),
    });
    expect(put.status).toBe(200);
    const payload = await put.json() as { effective: { mode: string; reason: string } };
    expect(payload.effective).toMatchObject({ mode: 'off', reason: 'manual' });
  });
});
