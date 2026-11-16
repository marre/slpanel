import { h } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/vue';
import { render, routerFixture } from '@/test/render';
import PresentationsPage from './presentations-page.vue';

const owner = 'aB3xZ9kQ';
const displayId = owner + '-fG7mNpQr2wLt';
const sourceId = 'source-1';
const profileId = 'presentation-1';
const display = {
  id: displayId,
  owner_id: owner,
  display_id: 'fG7mNpQr2wLt',
  name: 'Hallway',
  site_id: '9192',
  site_name: 'Slussen',
  refresh_interval: 30,
  line_numbers: [],
  directions: [],
  modes: [],
};
const source = {
  id: sourceId,
  owner_id: owner,
  name: 'Slussen',
  site_id: '9192',
  site_name: 'Slussen',
  refresh_interval: 30,
  line_numbers: [],
  directions: [],
  modes: [],
};
const profile = {
  id: profileId,
  owner_id: owner,
  name: 'Morning commute',
  data_source_id: sourceId,
  visualization: 'departures-list',
};
const baseControl = {
  display_id: displayId,
  timezone: 'Europe/Stockholm',
  default_presentation_id: profileId,
  manual: null,
  rules: [],
};
describe('PresentationsPage', () => {
  const fetchMock = vi.fn<typeof fetch>();
  let lastControl = structuredClone(baseControl) as {
    display_id: string;
    timezone: string;
    default_presentation_id: string;
    manual: {
      mode: string;
      presentation_id: string | null;
      until: string | null;
    } | null;
    rules: Array<unknown>;
  };
  beforeEach(() => {
    window.localStorage.clear();
    lastControl = { ...structuredClone(baseControl), manual: null, rules: [] };
    fetchMock.mockImplementation(async (input, init) => {
      const path = String(input);
      if (path.startsWith('/api/displays?owner='))
        return Response.json({ displays: [display] });
      if (path.startsWith('/api/data-sources?'))
        return Response.json({ data_sources: [source] });
      if (path.startsWith('/api/presentations?'))
        return Response.json({ presentations: [profile] });
      if (path.endsWith('/control')) {
        if (init?.method === 'PUT')
          lastControl = JSON.parse(String(init.body)) as typeof lastControl;
        return Response.json({
          display,
          control: lastControl,
          effective: {
            mode: lastControl.manual?.mode ?? 'presentation',
            reason: lastControl.manual ? 'manual' : 'default',
            presentation: profile,
            data_source: source,
            next_transition_at: null,
          },
        });
      }
      throw new Error('Unexpected request: ' + path);
    });
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });
  async function mount() {
    await render(
      routerFixture(
        ['/presentations?owner=' + owner],
        [
          [
            {
              path: '/presentations',
              element: h(PresentationsPage),
              children: [],
            },
          ],
        ],
      ),
    );
    await screen.findByText('Morning commute');
    await screen.findByRole('button', { name: 'Turn off now' });
  }
  it('shows saved profiles and makes a one-click off override', async () => {
    await mount();
    expect(screen.getByText('Slussen · 30s refresh')).toBeInTheDocument();
    await fireEvent.click(screen.getByRole('button', { name: 'Turn off now' }));
    await waitFor(() => {
      expect(lastControl.manual).toMatchObject({
        mode: 'off',
        presentation_id: null,
      });
    });
    expect(
      screen.getByText('Off — no departures displayed'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Resume schedule' }),
    ).toBeInTheDocument();
  });
  it('adds a weekday time window and saves the schedule', async () => {
    await mount();
    await fireEvent.click(
      screen.getByRole('button', { name: /add a time window/i }),
    );
    expect(screen.getByText('Repeat on')).toBeInTheDocument();
    await fireEvent.click(
      screen.getByRole('button', { name: 'Save default & schedule' }),
    );
    await waitFor(() => expect(lastControl.rules).toHaveLength(1));
    expect(lastControl.rules[0]).toMatchObject({
      days: [0, 1, 2, 3, 4],
      start_time: '06:00',
      end_time: '09:00',
      mode: 'presentation',
      presentation_id: profileId,
    });
    expect(await screen.findByText(/schedule saved/i)).toBeInTheDocument();
  });
});
