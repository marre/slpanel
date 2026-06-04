import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, vi } from 'vitest';

import { ConfigPage } from '@/routes/config-page';

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
        new Response(JSON.stringify({ owner_id: 'aB3xZ9kQ', displays: [] })),
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
          { status: 201 },
        ),
      );

    render(
      <MemoryRouter initialEntries={['/config?owner=aB3xZ9kQ']}>
        <Routes>
          <Route path="/config" element={<ConfigPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/displays?owner=aB3xZ9kQ',
        expect.objectContaining({
          headers: expect.objectContaining({ accept: 'application/json' }),
        }),
      );
    });

    fireEvent.change(screen.getByLabelText(/display name/i), {
      target: { value: 'Southbound platform' },
    });

    // Type "Slussen" into the AsyncSelect stop search
    const stopInput = screen.getByLabelText(/stop search/i);
    fireEvent.focus(stopInput);
    fireEvent.change(stopInput, { target: { value: 'Slussen' } });

    // Wait for the "Slussen" option to appear and click it
    const slussenOption = await screen.findByRole('option', {
      name: /Slussen/,
    });
    fireEvent.click(slussenOption);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/departures/1011?forecast=240',
        expect.objectContaining({
          headers: expect.objectContaining({ accept: 'application/json' }),
        }),
      );
    });

    fireEvent.click(screen.getByText('METRO'));

    // Select line "17" from the CreatableSelect dropdown
    const lineSelectInput = screen.getByLabelText('Line numbers');
    fireEvent.mouseDown(lineSelectInput);

    const lineOption17 = await screen.findByRole('option', { name: /17/ });
    fireEvent.click(lineOption17);

    // Select direction "Hagsätra" from the directions CreatableSelect
    const dirSelectInput = screen.getByLabelText('Direction filters');
    fireEvent.mouseDown(dirSelectInput);

    const dirOption = await screen.findByRole('option', {
      name: /Hagsätra/,
    });
    fireEvent.click(dirOption);

    fireEvent.click(screen.getByRole('button', { name: /create display/i }));

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
            modes: ['METRO'],
          }),
        }),
      );
    });

    expect(await screen.findByText(/display created/i)).toBeInTheDocument();
    expect(screen.getAllByText(/southbound platform/i).length).toBeGreaterThan(
      0,
    );
  });

  it('keeps line hints visible when the selected transport mode has no live matches', async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ owner_id: 'aB3xZ9kQ', displays: [] })),
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

    render(
      <MemoryRouter initialEntries={['/config?owner=aB3xZ9kQ']}>
        <Routes>
          <Route path="/config" element={<ConfigPage />} />
        </Routes>
      </MemoryRouter>,
    );

    const trainCheckbox = screen.getByRole('checkbox', { name: /train/i });

    fireEvent.click(trainCheckbox);

    expect(trainCheckbox).toBeChecked();

    // Type "Vallentuna" into the AsyncSelect stop search
    const stopInput = screen.getByLabelText(/stop search/i);
    fireEvent.focus(stopInput);
    fireEvent.change(stopInput, { target: { value: 'Vallentuna' } });

    // Wait for option and click it
    const vallentunaOption = await screen.findByRole('option', {
      name: /Vallentuna/,
    });
    fireEvent.click(vallentunaOption);

    // Open the line numbers dropdown to reveal the "27" option (fallback shows all lines)
    fireEvent.mouseDown(screen.getByLabelText('Line numbers'));

    expect(
      await screen.findByRole('option', { name: /27/ }),
    ).toBeInTheDocument();
  });
});
