import { afterEach, describe, expect, it, vi } from 'vitest';

import { listDisplays } from './config-api';

afterEach(() => vi.unstubAllGlobals());

describe('listDisplays', () => {
  it('uses the configured service base path and forwards cancellation', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ displays: [] }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController();
    await listDisplays(
      'markerik',
      controller.signal,
      'https://other.example/panel/',
    );
    expect(fetchMock).toHaveBeenCalledWith(
      'https://other.example/panel/api/displays?owner=markerik',
      expect.objectContaining({ signal: controller.signal }),
    );
    await listDisplays('markerik');
    expect(fetchMock).toHaveBeenLastCalledWith(
      '/api/displays?owner=markerik',
      expect.any(Object),
    );
  });
});
