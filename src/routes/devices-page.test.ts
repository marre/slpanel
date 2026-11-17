import { h } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/vue';
import { render, routerFixture } from '@/test/render';
import DevicesPage from './devices-page.vue';

const owner = 'aB3xZ9kQ';
const scene = {
  id: 'scene-1',
  owner_id: owner,
  name: 'Home departures',
  data_source_id: 'source-1',
  visualization: 'departures-list',
};
const display = {
  id: owner + '-fG7mNpQr2wLt',
  owner_id: owner,
  display_id: 'fG7mNpQr2wLt',
  name: 'Hallway panel',
  site_id: null,
  site_name: null,
  refresh_interval: 30,
  line_numbers: [],
  directions: [],
  modes: [],
};
describe('Devices page', () => {
  const fetchMock = vi.fn<typeof fetch>();
  let posted: Record<string, unknown> | null = null;
  let assigned: Record<string, unknown> | null = null;
  beforeEach(() => {
    window.localStorage.clear();
    posted = null;
    assigned = null;
    fetchMock.mockImplementation(async (input, init) => {
      const path = String(input);
      if (path.startsWith('/api/displays?'))
        return Response.json({ displays: [] });
      if (path.startsWith('/api/scenes?'))
        return Response.json({ scenes: [scene] });
      if (path.startsWith('/api/schedules?'))
        return Response.json({ schedules: [] });
      if (path === '/api/displays' && init?.method === 'POST') {
        posted = JSON.parse(String(init.body)) as Record<string, unknown>;
        return Response.json({ display }, { status: 201 });
      }
      if (path.endsWith('/assignment')) {
        if (init?.method === 'PUT') {
          assigned = JSON.parse(String(init.body)) as Record<string, unknown>;
          return Response.json({
            display,
            assignment: { display_id: display.id, ...assigned },
            effective: {
              mode: 'scene',
              reason: 'direct',
              scene,
              data_source: null,
              schedule_id: null,
              next_transition_at: null,
            },
          });
        }
        return Response.json({
          display,
          assignment: {
            display_id: display.id,
            kind: 'scene',
            scene_id: scene.id,
            schedule_id: null,
          },
          effective: {
            mode: 'scene',
            reason: 'direct',
            scene,
            data_source: null,
            schedule_id: null,
            next_transition_at: null,
          },
        });
      }
      throw new Error('Unexpected request ' + path);
    });
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });
  it('assigns a reusable scene while keeping a physical device ID', async () => {
    await render(
      routerFixture(
        ['/devices?owner=' + owner],
        [[{ path: '/devices', element: h(DevicesPage), children: [] }]],
      ),
    );
    await screen.findByRole('heading', { name: 'Your physical panels' });
    await screen.findByLabelText('Device name');
    await fireEvent.input(screen.getByLabelText('Device name'), {
      target: { value: 'Hallway panel' },
    });
    await fireEvent.click(screen.getByRole('button', { name: 'Add device' }));
    await waitFor(() => expect(assigned).not.toBeNull());
    expect(posted).toMatchObject({
      owner_id: owner,
      name: 'Hallway panel',
      site_id: null,
    });
    expect(assigned).toEqual({
      kind: 'scene',
      scene_id: scene.id,
      schedule_id: null,
    });
    expect(
      await screen.findByText(/physical ID remains unchanged/i),
    ).toBeInTheDocument();
  });
});

describe('Device list deletion', () => {
  const fetchMock = vi.fn<typeof fetch>();
  const deleted: string[] = [];
  beforeEach(() => {
    window.localStorage.clear();
    deleted.length = 0;
    fetchMock.mockImplementation(async (input, init) => {
      const path = String(input);
      if (path.startsWith('/api/displays?')) {
        return Response.json({ displays: deleted.length ? [] : [display] });
      }
      if (path.startsWith('/api/scenes?')) {
        return Response.json({ scenes: [scene] });
      }
      if (path.startsWith('/api/schedules?')) {
        return Response.json({ schedules: [] });
      }
      if (path.endsWith('/assignment')) {
        return Response.json({
          display,
          assignment: {
            display_id: display.id,
            kind: 'scene',
            scene_id: scene.id,
            schedule_id: null,
          },
          effective: {
            mode: 'scene',
            reason: 'direct',
            scene,
            data_source: null,
            schedule_id: null,
            next_transition_at: null,
          },
        });
      }
      if (path.startsWith('/api/displays/') && init?.method === 'DELETE') {
        deleted.push(path.slice('/api/displays/'.length));
        return new Response(null, { status: 204 });
      }
      throw new Error('Unexpected request ' + path);
    });
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it('does not delete the device without modal confirmation', async () => {
    await render(
      routerFixture(
        ['/devices?owner=' + owner],
        [[{ path: '/devices', element: h(DevicesPage), children: [] }]],
      ),
    );
    const deleteButton = await screen.findByRole('button', {
      name: 'Delete device Hallway panel',
    });
    await fireEvent.click(deleteButton);
    expect(await screen.findByText('Delete device?')).toBeInTheDocument();
    expect(deleted).toEqual([]);
    await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    expect(deleted).toEqual([]);
    await fireEvent.click(deleteButton);
    await fireEvent.click(
      await screen.findByRole('button', { name: 'Delete device', exact: true }),
    );
    await waitFor(() => expect(deleted).toEqual([display.id]));
    expect(
      screen.queryByRole('button', { name: 'Delete device Hallway panel' }),
    ).not.toBeInTheDocument();
  });
});
