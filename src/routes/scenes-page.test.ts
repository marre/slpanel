import { h } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/vue';
import { render, routerFixture } from '@/test/render';
import ScenesPage from './scenes-page.vue';

const owner = 'aB3xZ9kQ';
const source = {
  id: 'source-1',
  owner_id: owner,
  name: 'Stop',
  site_id: null,
  site_name: null,
  refresh_interval: 30,
  line_numbers: ['17'],
  directions: ['Hagsätra'],
  modes: ['METRO'],
};
const original = {
  id: 'scene-1',
  owner_id: owner,
  name: 'Morning',
  data_source_id: source.id,
  visualization: 'departures-list',
};

describe('Scenes list actions', () => {
  const fetchMock = vi.fn<typeof fetch>();
  let scenes: (typeof original)[];
  let copied: Record<string, unknown> | null;
  let deleted: string[];
  beforeEach(() => {
    window.localStorage.clear();
    scenes = [{ ...original }];
    copied = null;
    deleted = [];
    fetchMock.mockImplementation(async (input, init) => {
      const path = String(input);
      if (path.startsWith('/api/scenes?')) {
        return Response.json({ scenes });
      }
      if (path.startsWith('/api/data-sources?')) {
        return Response.json({ data_sources: [source] });
      }
      if (path === '/api/scenes' && init?.method === 'POST') {
        copied = JSON.parse(String(init.body)) as Record<string, unknown>;
        const scene = { ...original, ...copied, id: 'scene-copy' };
        scenes = [...scenes, scene];
        return Response.json({ scene }, { status: 201 });
      }
      if (path.startsWith('/api/scenes/') && init?.method === 'DELETE') {
        const id = path.slice('/api/scenes/'.length).split('?')[0];
        deleted.push(id);
        scenes = scenes.filter((scene) => scene.id !== id);
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

  async function renderList() {
    await render(
      routerFixture(
        ['/scenes?owner=' + owner],
        [[{ path: '/scenes', element: h(ScenesPage), children: [] }]],
      ),
    );
    await screen.findByRole('button', { name: 'Copy scene Morning' });
  }

  it('copies a scene with its existing source and selects the copy', async () => {
    await renderList();
    await fireEvent.click(
      screen.getByRole('button', { name: 'Copy scene Morning' }),
    );
    await waitFor(() =>
      expect(copied).toMatchObject({
        owner_id: owner,
        name: 'Copy of Morning',
        data_source_id: source.id,
        visualization: 'departures-list',
      }),
    );
    expect(
      await screen.findByRole('button', { name: 'Copy scene Copy of Morning' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Copy of Morning' }),
    ).toBeInTheDocument();
  });

  it('only deletes a scene after confirming its modal', async () => {
    await renderList();
    await fireEvent.click(
      screen.getByRole('button', { name: 'Delete scene Morning' }),
    );
    expect(await screen.findByText('Delete scene?')).toBeInTheDocument();
    expect(deleted).toEqual([]);
    await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    expect(deleted).toEqual([]);
    await fireEvent.click(
      screen.getByRole('button', { name: 'Delete scene Morning' }),
    );
    await fireEvent.click(
      await screen.findByRole('button', { name: 'Delete scene' }),
    );
    await waitFor(() => expect(deleted).toEqual([original.id]));
    expect(
      screen.queryByRole('button', { name: 'Copy scene Morning' }),
    ).not.toBeInTheDocument();
  });
});
