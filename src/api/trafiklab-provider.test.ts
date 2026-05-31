import { vi } from 'vitest';

import { createTrafiklabProvider } from './trafiklab-provider';

describe('createTrafiklabProvider', () => {
  it('filters and ranks stop search results locally', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify([
          { id: 1011, name: 'Slussen', note: 'Stockholm', type: 'METROSTN' },
          { id: 1012, name: 'Gamla stan', note: 'Stockholm', type: 'METROSTN' },
          { id: 1013, name: 'Slussplan', note: 'Bussterminal', type: 'BUS' },
        ]),
      ),
    );

    const provider = createTrafiklabProvider({
      fetch: fetchMock,
      baseUrl: 'https://example.com/v1',
    });

    await expect(provider.searchStops('Sluss')).resolves.toEqual([
      {
        site_id: '1011',
        name: 'Slussen',
        type: 'METROSTN',
        stop_area_name: 'Stockholm',
      },
      {
        site_id: '1013',
        name: 'Slussplan',
        type: 'BUS',
        stop_area_name: 'Bussterminal',
      },
    ]);
  });

  it('normalizes departures and applies local filters', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          departures: [
            {
              destination: 'Hagsätra',
              direction: 'Hagsätra',
              direction_code: 2,
              state: 'EXPECTED',
              display: '5 min',
              scheduled: '2026-05-29T08:18:30',
              expected: '2026-05-29T08:18:30',
              stop_point: { designation: '2' },
              line: { designation: '17', transport_mode: 'METRO' },
              deviations: [],
            },
            {
              destination: 'Farsta strand',
              direction: 'Farsta strand',
              direction_code: 1,
              state: 'EXPECTED',
              display: '12 min',
              scheduled: '2026-05-29T08:25:30',
              expected: '2026-05-29T08:25:30',
              stop_point: { designation: '1' },
              line: { designation: '18', transport_mode: 'METRO' },
              deviations: [],
            },
          ],
        }),
      ),
    );

    const provider = createTrafiklabProvider({
      fetch: fetchMock,
      baseUrl: 'https://example.com/v1',
    });

    await expect(
      provider.getDepartures({
        site_id: '1011',
        lines: ['17'],
        directions: ['Hagsätra'],
        modes: ['METRO'],
        forecast: 30,
      }),
    ).resolves.toEqual([
      {
        line_number: '17',
        destination: 'Hagsätra',
        display_time: '5 min',
        minutes_until_departure: 5,
        scheduled_at: '2026-05-29T08:18:30',
        expected_at: '2026-05-29T08:18:30',
        transport_mode: 'METRO',
        platform: '2',
        state: 'EXPECTED',
      },
    ]);
  });

  it('shows clock time for departures more than 30 minutes away', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          departures: [
            {
              destination: 'Vallentuna',
              direction: 'Vallentuna',
              direction_code: 1,
              state: 'EXPECTED',
              display: '35 min',
              scheduled: '2026-05-31T14:05:00+02:00',
              expected: '2026-05-31T14:05:00+02:00',
              stop_point: { designation: '1' },
              line: { designation: '27', transport_mode: 'TRAM' },
              deviations: [],
            },
          ],
        }),
      ),
    );

    const provider = createTrafiklabProvider({
      fetch: fetchMock,
      baseUrl: 'https://example.com/v1',
    });

    await expect(
      provider.getDepartures({
        site_id: '9626',
        lines: [],
        directions: [],
        modes: [],
        forecast: 240,
      }),
    ).resolves.toEqual([
      {
        line_number: '27',
        destination: 'Vallentuna',
        display_time: '14:05',
        minutes_until_departure: 35,
        scheduled_at: '2026-05-31T14:05:00+02:00',
        expected_at: '2026-05-31T14:05:00+02:00',
        transport_mode: 'TRAM',
        platform: '1',
        state: 'EXPECTED',
      },
    ]);
  });
});
