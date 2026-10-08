import { h } from 'vue';
import { fireEvent, screen, waitFor } from '@testing-library/vue';
import { render, routerFixture } from '@/test/render';
import { afterEach, beforeEach, vi } from 'vitest';
import ConfigPage from '@/routes/config-page.vue';
describe('ConfigPage', () => {
  const fetchMock = vi.fn<typeof fetch>();
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    window.localStorage.clear();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });
  it('loads an owner, searches stops, and creates a display', async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            owner_id: 'aB3xZ9kQ',
            displays: [],
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            query: 'Slussen',
            results: [
              {
                site_id: '1011',
                name: 'Slussen',
                stop_area_name: 'Slussen',
                type: 'METROSTN',
              },
            ],
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            site_id: '1011',
            departures: [
              {
                line_number: '17',
                destination: 'Hagsätra',
                display_time: '5 min',
                minutes_until_departure: 5,
                scheduled_at: '2026-05-29T12:00:00',
                expected_at: '2026-05-29T12:00:00',
                transport_mode: 'METRO',
                platform: '2',
                state: 'EXPECTED',
              },
              {
                line_number: '18',
                destination: 'Farsta strand',
                display_time: '8 min',
                minutes_until_departure: 8,
                scheduled_at: '2026-05-29T12:03:00',
                expected_at: '2026-05-29T12:03:00',
                transport_mode: 'METRO',
                platform: '2',
                state: 'EXPECTED',
              },
            ],
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            display: {
              id: 'aB3xZ9kQ-fG7mNpQr2wLt',
              owner_id: 'aB3xZ9kQ',
              display_id: 'fG7mNpQr2wLt',
              name: 'Southbound platform',
              site_id: '1011',
              site_name: 'Slussen',
              refresh_interval: 30,
              line_numbers: ['17', '18'],
              directions: ['Hagsätra'],
              modes: ['METRO'],
            },
          }),
          {
            status: 201,
          },
        ),
      );
    await render(
      routerFixture(
        ['/config?owner=aB3xZ9kQ'],
        [
          [
            {
              path: '/config',
              element: h(ConfigPage, {}),
              children: [],
            },
          ],
        ],
      ),
    );
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/displays?owner=aB3xZ9kQ',
        expect.objectContaining({
          headers: expect.objectContaining({
            accept: 'application/json',
          }),
        }),
      );
    });
    await fireEvent.input(screen.getByLabelText(/display name/i), {
      target: {
        value: 'Southbound platform',
      },
    });

    // Type "Slussen" into the AsyncSelect stop search
    const stopInput = screen.getByLabelText(/stop search/i);
    await fireEvent.focus(stopInput);
    await fireEvent.input(stopInput, {
      target: {
        value: 'Slussen',
      },
    });

    // Wait for the "Slussen" option to appear and click it
    const slussenOption = await screen.findByRole('option', {
      name: /Slussen/,
    });
    await fireEvent.click(slussenOption);
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/departures/1011?forecast=240',
        expect.objectContaining({
          headers: expect.objectContaining({
            accept: 'application/json',
          }),
        }),
      );
    });
    const board = await screen.findByRole('img', {
      name: /Southbound platform/,
    });
    const summary = () =>
      document.getElementById(board.getAttribute('aria-describedby')!)!;
    await waitFor(() => expect(summary()).toHaveTextContent('Farsta strand'));

    // Select line "17" from the CreatableSelect dropdown
    const lineSelectInput = screen.getByLabelText('Line numbers');
    await fireEvent.keyDown(lineSelectInput, { key: 'ArrowDown' });
    const lineOption17 = await screen.findByRole('option', {
      name: /17/,
    });
    await fireEvent.click(lineOption17);
    expect(summary()).toHaveTextContent('Hagsätra');
    expect(summary()).not.toHaveTextContent('Farsta strand');
    expect(
      fetchMock.mock.calls.some(([, init]) => init?.method === 'POST'),
    ).toBe(false);

    // Select direction "Hagsätra" from the directions CreatableSelect
    const dirSelectInput = screen.getByLabelText('Direction filters');
    await fireEvent.keyDown(dirSelectInput, { key: 'ArrowDown' });
    const dirOption = await screen.findByRole('option', {
      name: /Hagsätra/,
    });
    await fireEvent.click(dirOption);
    await fireEvent.click(
      screen.getByRole('button', {
        name: /create display/i,
      }),
    );
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/displays',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            owner_id: 'aB3xZ9kQ',
            name: 'Southbound platform',
            site_id: '1011',
            site_name: 'Slussen',
            refresh_interval: 30,
            line_numbers: ['17'],
            directions: ['Hagsätra'],
            modes: [],
          }),
        }),
      );
    });
    expect(await screen.findByText(/display created/i)).toBeInTheDocument();
    expect(screen.getAllByText(/southbound platform/i).length).toBeGreaterThan(
      0,
    );
  });
  it('shows line options from departures after selecting a stop', async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            owner_id: 'aB3xZ9kQ',
            displays: [],
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            query: 'Vallentuna',
            results: [
              {
                site_id: '9626',
                name: 'Vallentuna',
                stop_area_name: 'Vallentuna',
                type: 'STOP',
              },
            ],
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            site_id: '9626',
            departures: [
              {
                line_number: '27',
                destination: 'Ormsta',
                display_time: '2 min',
                minutes_until_departure: 2,
                scheduled_at: '2026-05-29T14:10:00',
                expected_at: '2026-05-29T14:11:04',
                transport_mode: 'TRAM',
                platform: '1',
                state: 'EXPECTED',
              },
            ],
          }),
        ),
      );
    await render(
      routerFixture(
        ['/config?owner=aB3xZ9kQ'],
        [
          [
            {
              path: '/config',
              element: h(ConfigPage, {}),
              children: [],
            },
          ],
        ],
      ),
    );

    // Type "Vallentuna" into the AsyncSelect stop search
    const stopInput = screen.getByLabelText(/stop search/i);
    await fireEvent.focus(stopInput);
    await fireEvent.input(stopInput, {
      target: {
        value: 'Vallentuna',
      },
    });

    // Wait for option and click it
    const vallentunaOption = await screen.findByRole('option', {
      name: /Vallentuna/,
    });
    await fireEvent.click(vallentunaOption);

    // Open the line numbers dropdown to reveal the "27" option (fallback shows all lines)
    await fireEvent.keyDown(screen.getByLabelText('Line numbers'), {
      key: 'ArrowDown',
    });
    expect(
      await screen.findByRole('option', {
        name: /27/,
      }),
    ).toBeInTheDocument();
  });
  it('requires confirmation before deleting a display', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          owner_id: 'aB3xZ9kQ',
          displays: [
            {
              id: 'aB3xZ9kQ-fG7mNpQr2wLt',
              owner_id: 'aB3xZ9kQ',
              display_id: 'fG7mNpQr2wLt',
              name: 'Southbound platform',
              site_id: '1011',
              site_name: 'Slussen',
              refresh_interval: 30,
              line_numbers: [],
              directions: [],
              modes: [],
            },
          ],
        }),
      ),
    );
    await render(
      routerFixture(
        ['/config?owner=aB3xZ9kQ'],
        [
          [
            {
              path: '/config',
              element: h(ConfigPage, {}),
              children: [],
            },
          ],
        ],
      ),
    );
    expect(
      await screen.findByRole('button', {
        name: /delete display/i,
      }),
    ).toBeInTheDocument();
    await fireEvent.click(
      screen.getByRole('button', {
        name: /delete display/i,
      }),
    );
    expect(
      screen.getByRole('button', {
        name: /confirm delete/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: /keep board/i,
      }),
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.stringContaining('/api/displays/aB3xZ9kQ-fG7mNpQr2wLt'),
      expect.objectContaining({
        method: 'DELETE',
      }),
    );
  });
});
