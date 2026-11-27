import { vi } from 'vitest';
import { createServiceCatalog, partitionId } from './service-catalog';

describe('planned service catalogue', () => {
  it('resolves multiple stop areas and caches verified shards', async () => {
    const area = '9021001001234000';
    const other = '9021001001298000';
    expect(await partitionId(area, 64)).toBe(18);
    expect(await partitionId(other, 64)).toBe(18);
    const shard = {
      schema: 1,
      partition: 18,
      areas: {
        [area]: { services: [{ routeId: 'r', destination: 'Ormsta' }] },
        [other]: { services: [{ routeId: 'r', destination: 'Kårsta' }] },
      },
      routes: { r: { line: '27', routeType: 109 } },
    };
    const raw = JSON.stringify(shard);
    const bytes = new TextEncoder().encode(raw);
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
    const sha256 = Array.from(digest, (b) => b.toString(16).padStart(2, '0')).join(
      '',
    );
    const file = `part-18-${sha256}.json`;
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.endsWith('sites?expand=true')) {
        return Response.json([{ id: 42, stop_areas: [1234, 1298] }]);
      }
      if (url.endsWith('manifest.json')) {
        return Response.json({
          schema: 1,
          partitionMethod: 'sl-stop-area-modulo-or-sha256-u32be-v1',
          partitionCount: 64,
          validTo: '2026-12-24',
          partitions: { 18: { file, sha256, bytes: bytes.length } },
        });
      }
      if (url.endsWith(file)) return new Response(raw);
      throw new Error(url);
    });
    const provider = createServiceCatalog({
      fetch: fetchMock,
      now: () => Date.parse('2026-11-27T12:00:00Z'),
    });
    const first = await provider.getServices('42');
    expect(first).toMatchObject({
      complete: true,
      services: [
        { line_number: '27', transport_mode: 'TRAM', destination: 'Ormsta' },
        { line_number: '27', transport_mode: 'TRAM', destination: 'Kårsta' },
      ],
    });
    expect(await provider.getServices('42')).toEqual(first);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('reports an unavailable catalogue without inventing a site mapping', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => Response.json([]));
    await expect(
      createServiceCatalog({ fetch: fetchMock }).getServices('42'),
    ).rejects.toMatchObject({ status: 503, code: 'catalog_unavailable' });
  });
});
