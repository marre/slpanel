import { describe, expect, it, vi } from 'vitest';

import {
  loadPicographicsModuleSource,
  PICOGRAPHICS_MODULE_SOURCE_URL,
  loadPicographicsPythonSource,
  PICOGRAPHICS_PYTHON_SOURCE_URL,
  loadSlpanelInstrumentationSource,
  SLPANEL_INSTRUMENTATION_SOURCE_URL,
} from '@/lib/picographics-python-source';

describe('loadPicographicsPythonSource', () => {
  it('loads the shared Python board module from the public asset path', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(
          'def draw_board(graphics, frame_input, marquee_state):\n    pass\n',
        ),
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
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('missing', { status: 404 }));

    await expect(loadPicographicsPythonSource(fetchMock)).rejects.toThrow(
      /could not load the picographics python source/i,
    );
  });
});

describe('loadPicographicsModuleSource', () => {
  it('loads the shared picographics module from the public asset path', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response('class PicoGraphics:\n    pass\n'),
      );

    await expect(loadPicographicsModuleSource(fetchMock)).resolves.toContain(
      'PicoGraphics',
    );

    expect(fetchMock).toHaveBeenCalledWith(PICOGRAPHICS_MODULE_SOURCE_URL, {
      headers: {
        accept: 'text/plain',
      },
    });
  });
});

describe('loadSlpanelInstrumentationSource', () => {
  it('loads the shared instrumentation module from the public asset path', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response('def debug_log(event, payload=None):\n    pass\n'),
      );

    await expect(
      loadSlpanelInstrumentationSource(fetchMock),
    ).resolves.toContain('debug_log');

    expect(fetchMock).toHaveBeenCalledWith(
      SLPANEL_INSTRUMENTATION_SOURCE_URL,
      {
        headers: {
          accept: 'text/plain',
        },
      },
    );
  });
});
