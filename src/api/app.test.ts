import { createApp } from './app';
import { createMemoryDisplayStore } from './memory-display-store';
import type { TransitProvider } from './transit-provider';

function createTestProvider(): TransitProvider {
  return {
    async searchStops(query) {
      return [
        {
          site_id: '1011',
          name: `${query} Station`,
          type: 'METROSTN',
          stop_area_name: `${query} Station`,
        },
      ];
    },
    async getDepartures(query) {
      return [
        {
          line_number: query.lines[0] ?? '17',
          destination: 'Hagsätra',
          display_time: '5 min',
          minutes_until_departure: 5,
          scheduled_at: '2026-05-29T08:18:30',
          expected_at: '2026-05-29T08:18:30',
          transport_mode: query.modes[0] ?? 'METRO',
          platform: '2',
          state: 'EXPECTED',
        },
      ];
    },
  };
}

describe('createApp', () => {
  it('supports display CRUD through the API routes', async () => {
    const displayStore = createMemoryDisplayStore();
    const app = createApp({
      transitProvider: createTestProvider(),
      createDisplayStore: () => displayStore,
    });

    const createResponse = await app.request('/api/displays', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        owner_id: 'aB3xZ9kQ',
        name: 'Southbound platform',
        site_id: '1011',
        site_name: 'Slussen',
        refresh_interval: 30,
        line_numbers: ['17', '18'],
        directions: ['Hagsätra'],
        modes: ['metro'],
      }),
    });

    expect(createResponse.status).toBe(201);

    const createdPayload = (await createResponse.json()) as {
      display: { id: string; modes: string[]; line_numbers: string[] };
    };

    expect(createdPayload.display.id).toMatch(/^aB3xZ9kQ-[A-Za-z0-9]{12}$/);
    expect(createdPayload.display.modes).toEqual(['METRO']);
    expect(createdPayload.display.line_numbers).toEqual(['17', '18']);

    const listResponse = await app.request('/api/displays?owner=aB3xZ9kQ');
    const listPayload = (await listResponse.json()) as {
      displays: Array<{ id: string }>;
    };

    expect(listResponse.status).toBe(200);
    expect(listPayload.displays).toHaveLength(1);

    const displayId = listPayload.displays[0].id;
    const updateResponse = await app.request(`/api/displays/${displayId}`, {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Updated platform',
        refresh_interval: 45,
        line_numbers: ['19'],
      }),
    });

    expect(updateResponse.status).toBe(200);

    const updatedPayload = (await updateResponse.json()) as {
      display: {
        name: string;
        refresh_interval: number;
        line_numbers: string[];
      };
    };

    expect(updatedPayload.display.name).toBe('Updated platform');
    expect(updatedPayload.display.refresh_interval).toBe(45);
    expect(updatedPayload.display.line_numbers).toEqual(['19']);

    const getResponse = await app.request(`/api/displays/${displayId}`);
    const getPayload = (await getResponse.json()) as {
      display: { id: string };
    };

    expect(getResponse.status).toBe(200);
    expect(getPayload.display.id).toBe(displayId);

    const deleteResponse = await app.request(`/api/displays/${displayId}`, {
      method: 'DELETE',
    });

    expect(deleteResponse.status).toBe(204);

    const emptyListResponse = await app.request('/api/displays?owner=aB3xZ9kQ');
    const emptyListPayload = (await emptyListResponse.json()) as {
      displays: Array<unknown>;
    };

    expect(emptyListPayload.displays).toEqual([]);
  });

  it('exposes stop search and departures through the transit provider', async () => {
    const app = createApp({
      transitProvider: createTestProvider(),
      createDisplayStore: () => createMemoryDisplayStore(),
    });

    const stopsResponse = await app.request('/api/stops/search?q=Slussen');
    const stopsPayload = (await stopsResponse.json()) as {
      query: string;
      results: Array<{ site_id: string }>;
    };

    expect(stopsResponse.status).toBe(200);
    expect(stopsPayload.query).toBe('Slussen');
    expect(stopsPayload.results[0].site_id).toBe('1011');

    const departuresResponse = await app.request(
      '/api/departures/1011?line=17&mode=METRO&direction=Hags%C3%A4tra',
    );
    const departuresPayload = (await departuresResponse.json()) as {
      site_id: string;
      departures: Array<{ line_number: string; transport_mode: string }>;
    };

    expect(departuresResponse.status).toBe(200);
    expect(departuresPayload.site_id).toBe('1011');
    expect(departuresPayload.departures[0]).toMatchObject({
      line_number: '17',
      transport_mode: 'METRO',
    });
  });

  it('returns structured validation errors for bad requests', async () => {
    const app = createApp({
      transitProvider: createTestProvider(),
      createDisplayStore: () => createMemoryDisplayStore(),
    });

    const response = await app.request('/api/displays?owner=bad-owner-id');
    const payload = (await response.json()) as {
      error: { code: string; message: string };
    };

    expect(response.status).toBe(400);
    expect(payload.error.code).toBe('validation_error');
    expect(payload.error.message).toMatch(/owner_id/i);
  });
});
