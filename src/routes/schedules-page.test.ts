import { h } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/vue';
import { render, routerFixture } from '@/test/render';
import SchedulesPage from './schedules-page.vue';

const owner = 'aB3xZ9kQ';
const scene = {
  id: 'scene-1',
  owner_id: owner,
  name: 'Morning departures',
  data_source_id: 'source-1',
  visualization: 'departures-list',
};
describe('Schedules page', () => {
  const fetchMock = vi.fn<typeof fetch>();
  let saved: Record<string, unknown> | null = null;
  beforeEach(() => {
    window.localStorage.clear();
    saved = null;
    fetchMock.mockImplementation(async (input, init) => {
      const path = String(input);
      if (path.startsWith('/api/schedules?'))
        return Response.json({ schedules: [] });
      if (path.startsWith('/api/scenes?'))
        return Response.json({ scenes: [scene] });
      if (path === '/api/schedules' && init?.method === 'POST') {
        saved = JSON.parse(String(init.body)) as Record<string, unknown>;
        return Response.json(
          {
            schedule: {
              id: 'schedule-1',
              ...saved,
              rules: (saved.rules as Array<unknown>).map((rule) => ({
                id: 'rule-1',
                ...(rule as object),
              })),
            },
          },
          { status: 201 },
        );
      }
      throw new Error('Unexpected request ' + path);
    });
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });
  it('shows immutable Off fallback and saves only scene windows', async () => {
    await render(
      routerFixture(
        ['/schedules?owner=' + owner],
        [[{ path: '/schedules', element: h(SchedulesPage), children: [] }]],
      ),
    );
    expect(
      await screen.findByText('Off is always the default'),
    ).toBeInTheDocument();
    await screen.findByRole('button', { name: /add time window/i });
    await fireEvent.input(screen.getByLabelText('Schedule name'), {
      target: { value: 'Weekday commute' },
    });
    await fireEvent.click(
      screen.getByRole('button', { name: /add time window/i }),
    );
    expect(screen.getByText('Off at all other times.')).toBeInTheDocument();
    await fireEvent.click(
      screen.getByRole('button', { name: 'Create schedule' }),
    );
    await waitFor(() => expect(saved).not.toBeNull());
    expect(saved).toMatchObject({
      owner_id: owner,
      name: 'Weekday commute',
      timezone: 'Europe/Stockholm',
      rules: [
        {
          days: [0, 1, 2, 3, 4],
          start_time: '07:00',
          end_time: '09:00',
          scene_id: scene.id,
        },
      ],
    });
    expect(Object.keys(saved!)).not.toContain('default');
    expect(Object.keys(saved!)).not.toContain('default_scene_id');
  });

  it('shows a weekly overview and edits a selected time window', async () => {
    await render(
      routerFixture(
        ['/schedules?owner=' + owner],
        [[{ path: '/schedules', element: h(SchedulesPage), children: [] }]],
      ),
    );
    await screen.findByRole('button', { name: /add time window/i });
    await fireEvent.click(
      screen.getByRole('button', { name: /add time window/i }),
    );
    expect(screen.getByText('Weekly overview')).toBeInTheDocument();
    expect(screen.getByText('Edit selected window')).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: /edit morning departures on monday/i,
      }),
    ).toBeInTheDocument();
    await fireEvent.click(screen.getByRole('button', { name: 'Weekend' }));
    expect(
      screen.queryByRole('button', {
        name: /edit morning departures on monday/i,
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: /edit morning departures on saturday/i,
      }),
    ).toBeInTheDocument();
  });

  it('searches and selects a timezone using the combobox', async () => {
    await render(
      routerFixture(
        ['/schedules?owner=' + owner],
        [[{ path: '/schedules', element: h(SchedulesPage), children: [] }]],
      ),
    );
    await screen.findByRole('button', { name: /add time window/i });
    await fireEvent.click(screen.getByRole('button', { name: 'Timezone' }));
    await fireEvent.update(
      screen.getByPlaceholderText('Search timezones…'),
      'Asia/Tokyo',
    );
    await fireEvent.click(
      await screen.findByRole('option', { name: 'Asia/Tokyo' }),
    );
    await fireEvent.input(screen.getByLabelText('Schedule name'), {
      target: { value: 'Tokyo schedule' },
    });
    await fireEvent.click(
      screen.getByRole('button', { name: /add time window/i }),
    );
    await fireEvent.click(
      screen.getByRole('button', { name: 'Create schedule' }),
    );
    await waitFor(() =>
      expect(saved).toMatchObject({ timezone: 'Asia/Tokyo' }),
    );
  });
});

describe('Schedule list actions', () => {
  const fetchMock = vi.fn<typeof fetch>();
  const schedule = {
    id: 'schedule-one',
    owner_id: owner,
    name: 'Weekdays',
    timezone: 'Europe/Stockholm',
    rules: [
      {
        id: 'rule-one',
        days: [0, 1, 2, 3, 4],
        start_time: '07:00',
        end_time: '09:00',
        scene_id: scene.id,
      },
    ],
  };
  let schedules: (typeof schedule)[];
  let copied: Record<string, unknown> | null;
  let deleted: string[];

  beforeEach(() => {
    window.localStorage.clear();
    schedules = [schedule];
    copied = null;
    deleted = [];
    fetchMock.mockImplementation(async (input, init) => {
      const path = String(input);
      if (path.startsWith('/api/schedules?')) {
        return Response.json({ schedules });
      }
      if (path.startsWith('/api/scenes?')) {
        return Response.json({ scenes: [scene] });
      }
      if (path === '/api/schedules' && init?.method === 'POST') {
        copied = JSON.parse(String(init.body)) as Record<string, unknown>;
        const next = {
          id: 'schedule-copy',
          ...copied,
          rules: (copied.rules as (typeof schedule.rules)[number][]).map(
            (rule) => ({ ...rule, id: 'rule-copy' }),
          ),
        } as typeof schedule;
        schedules = [...schedules, next];
        return Response.json({ schedule: next }, { status: 201 });
      }
      if (path.startsWith('/api/schedules/') && init?.method === 'DELETE') {
        const id = path.slice('/api/schedules/'.length).split('?')[0];
        deleted.push(id);
        schedules = schedules.filter((item) => item.id !== id);
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
        ['/schedules?owner=' + owner],
        [[{ path: '/schedules', element: h(SchedulesPage), children: [] }]],
      ),
    );
    await screen.findByRole('button', { name: 'Copy schedule Weekdays' });
  }

  it('copies time windows as a new schedule with no inherited rule IDs', async () => {
    await renderList();
    await fireEvent.click(
      screen.getByRole('button', { name: 'Copy schedule Weekdays' }),
    );
    await waitFor(() =>
      expect(copied).toMatchObject({
        owner_id: owner,
        name: 'Copy of Weekdays',
        timezone: schedule.timezone,
        rules: [
          {
            days: [0, 1, 2, 3, 4],
            start_time: '07:00',
            end_time: '09:00',
            scene_id: scene.id,
          },
        ],
      }),
    );
    expect((copied?.rules as Record<string, unknown>[])[0]).not.toHaveProperty(
      'id',
    );
    expect(
      await screen.findByRole('button', {
        name: 'Copy schedule Copy of Weekdays',
      }),
    ).toBeInTheDocument();
  });

  it('cancels then confirms list deletion', async () => {
    await renderList();
    await fireEvent.click(
      screen.getByRole('button', { name: 'Delete schedule Weekdays' }),
    );
    expect(await screen.findByText('Delete schedule?')).toBeInTheDocument();
    expect(deleted).toEqual([]);
    await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    expect(deleted).toEqual([]);
    await fireEvent.click(
      screen.getByRole('button', { name: 'Delete schedule Weekdays' }),
    );
    await fireEvent.click(
      await screen.findByRole('button', { name: 'Delete schedule' }),
    );
    await waitFor(() => expect(deleted).toEqual([schedule.id]));
  });
});
