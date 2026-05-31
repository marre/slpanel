import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DisplayPage } from '@/routes/display-page';

describe('DisplayPage', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn(() => 1),
    );
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      fillRect: vi.fn(),
      clearRect: vi.fn(),
      drawImage: vi.fn(),
      imageSmoothingEnabled: true,
      beginPath: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
      fillStyle: '#000000',
    } as unknown as CanvasRenderingContext2D);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it('loads one display and its filtered departures', async () => {
    fetchMock
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
              refresh_interval: 45,
              line_numbers: ['17', '18'],
              directions: ['Hagsätra'],
              modes: ['METRO'],
            },
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
                display_time: '1 min',
                minutes_until_departure: 1,
                scheduled_at: '2026-05-29T12:00:00Z',
                expected_at: '2026-05-29T12:01:00Z',
                transport_mode: 'METRO',
                platform: '2',
                state: 'EXPECTED',
              },
              {
                line_number: '18',
                destination: 'Farsta strand',
                display_time: '4 min',
                minutes_until_departure: 4,
                scheduled_at: '2026-05-29T12:03:00Z',
                expected_at: '2026-05-29T12:04:00Z',
                transport_mode: 'METRO',
                platform: '2',
                state: 'EXPECTED',
              },
            ],
          }),
        ),
      );

    render(
      <MemoryRouter initialEntries={['/display/aB3xZ9kQ-fG7mNpQr2wLt']}>
        <Routes>
          <Route path="/display/:displayId" element={<DisplayPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/displays/aB3xZ9kQ-fG7mNpQr2wLt',
        expect.objectContaining({
          headers: expect.objectContaining({ accept: 'application/json' }),
        }),
      );
    });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/departures/1011?line=17&line=18&direction=Hags%C3%A4tra&mode=METRO&forecast=240',
        expect.objectContaining({
          headers: expect.objectContaining({ accept: 'application/json' }),
        }),
      );
    });

    expect(
      await screen.findByRole('heading', { name: /southbound platform/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('img', {
        name: /sl departure board for southbound platform/i,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText(/refreshes every 45 seconds/i)).toBeInTheDocument();
  });

  it('polls departures using the configured refresh interval', async () => {
    fetchMock
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
              refresh_interval: 1,
              line_numbers: ['17'],
              directions: [],
              modes: [],
            },
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            site_id: '1011',
            departures: [],
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            site_id: '1011',
            departures: [],
          }),
        ),
      );

    render(
      <MemoryRouter initialEntries={['/display/aB3xZ9kQ-fG7mNpQr2wLt']}>
        <Routes>
          <Route path="/display/:displayId" element={<DisplayPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    await waitFor(
      () => {
        expect(fetchMock).toHaveBeenCalledTimes(3);
      },
      { timeout: 2500 },
    );

    expect(fetchMock.mock.calls[2]?.[0]).toBe(
      '/api/departures/1011?line=17&forecast=240',
    );
  });

  it('describes the fixed 2-row board layout', async () => {
    render(
      <MemoryRouter initialEntries={['/display/demo-board']}>
        <Routes>
          <Route path="/display/:displayId" element={<DisplayPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(
      screen.getByText(/2-row layout is fixed/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/4 empty pixels above, between, and below the two rows/i),
    ).toBeInTheDocument();
  });
});
