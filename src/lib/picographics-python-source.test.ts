import { describe, expect, it, vi } from 'vitest';

import {
  loadPicographicsPythonSource,
  PICOGRAPHICS_PYTHON_SOURCE_URL,
} from '@/lib/picographics-python-source';

describe('loadPicographicsPythonSource', () => {
  it('loads the shared Python board module from the public asset path', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response('def draw_board(graphics, frame_input, marquee_state):\n    pass\n'),
    );

    await expect(loadPicographicsPythonSource(fetchMock)).resolves.toContain(
      'draw_board',
    );

    expect(fetchMock).toHaveBeenCalledWith(PICOGRAPHICS_PYTHON_SOURCE_URL, {
      headers: {
        accept: 'text/plain',
      },
    });
  });

  it('throws when the Python board module cannot be loaded', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response('missing', { status: 404 }),
    );

    await expect(loadPicographicsPythonSource(fetchMock)).rejects.toThrow(
      /could not load the picographics python source/i,
    );
  });
});