import { describe, expect, it, vi } from 'vitest';

import { createPyScriptPicographicsController } from '@/lib/pyscript-picographics-controller';

describe('createPyScriptPicographicsController', () => {
  it('creates and advances marquee state through the Python bridge', async () => {
    const advanceAndDrawFrameJson = vi.fn().mockResolvedValue(
      JSON.stringify({
        marquee_state: {
          active_content: {
            text: '18 Farsta strand 4 min',
            interruptible: false,
          },
          pending_content: {
            text: '18 Farsta strand 4 min',
            interruptible: false,
          },
          marquee_offset: 96,
        },
        commands: [['set_pen', '#020202'], ['clear'], ['update']],
      }),
    );
    const setMeasurementsJson = vi.fn();
    const advanceAndDrawCurrentFrameJson = vi.fn().mockResolvedValue(
      JSON.stringify({
        marquee_state: {
          active_content: {
            text: '18 Farsta strand 4 min',
            interruptible: false,
          },
          pending_content: {
            text: '18 Farsta strand 4 min',
            interruptible: false,
          },
          marquee_offset: 96,
        },
        commands: [['set_pen', '#020202'], ['clear'], ['update']],
      }),
    );
    const controller = createPyScriptPicographicsController({
      setMeasurementsJson,
      advanceAndDrawCurrentFrameJson,
      advanceAndDrawFrameJson,
      drawBoardCommandsJson: vi.fn(),
    });
    const initialState = controller.createMarqueeState({
      departures: [],
      tone: 'live',
      headline: 'Live departures',
      detail: 'Board is running',
    });

    const nextState = await controller.advanceMarqueeState(
      createGraphics(24),
      initialState,
      {
        departures: [],
        tone: 'live',
        headline: 'Live departures',
        detail: 'Board is running',
      },
      1,
    );

    expect(setMeasurementsJson).toHaveBeenCalledWith(expect.any(String));
    expect(advanceAndDrawCurrentFrameJson).toHaveBeenCalledWith(1);
    expect(advanceAndDrawFrameJson).not.toHaveBeenCalled();
    expect(nextState.marqueeOffset).toBe(96);
  });

  it('replays Python-generated draw commands on the Picographics surface', async () => {
    const graphics = createGraphics(18);
    const drawBoardCommandsJson = vi
      .fn()
      .mockResolvedValue(
        JSON.stringify([
          ['set_pen', '#020202'],
          ['clear'],
          ['set_pen', '#ffb347'],
          ['text', 'Loading departures', 2, 4, 124],
          ['update'],
        ]),
      );
    const controller = createPyScriptPicographicsController({
      advanceAndDrawFrameJson: vi.fn(),
      setMeasurementsJson: vi.fn(),
      advanceAndDrawCurrentFrameJson: vi.fn(),
      drawBoardCommandsJson,
    });

    await controller.drawBoard(
      graphics,
      {
        departures: [],
        tone: 'loading',
        headline: 'Loading departures',
        detail: 'Board is starting',
      },
      {
        activeContent: {
          text: 'Loading departures',
          interruptible: true,
        },
        pendingContent: {
          text: 'Loading departures',
          interruptible: true,
        },
        marqueeOffset: 128,
      },
    );

    expect(drawBoardCommandsJson).toHaveBeenCalledWith(
      expect.stringContaining('"tone":"loading"'),
      expect.any(String),
    );
    expect(graphics.set_pen).toHaveBeenCalledWith('#020202');
    expect(graphics.clear).toHaveBeenCalledTimes(1);
    expect(graphics.text).toHaveBeenCalledWith('Loading departures', 2, 4, 124);
    expect(graphics.update).toHaveBeenCalledTimes(1);
  });

  it('reuses commands prepared during marquee advancement', async () => {
    const graphics = createGraphics(18);
    const controller = createPyScriptPicographicsController({
      setMeasurementsJson: vi.fn(),
      advanceAndDrawCurrentFrameJson: vi.fn().mockResolvedValue(
        JSON.stringify({
          marquee_state: {
            active_content: {
              text: 'Loading departures',
              interruptible: true,
            },
            pending_content: {
              text: 'Loading departures',
              interruptible: true,
            },
            marquee_offset: 110,
          },
          commands: [['set_pen', '#020202'], ['clear'], ['update']],
        }),
      ),
      advanceAndDrawFrameJson: vi.fn().mockResolvedValue(
        JSON.stringify({
          marquee_state: {
            active_content: {
              text: 'Loading departures',
              interruptible: true,
            },
            pending_content: {
              text: 'Loading departures',
              interruptible: true,
            },
            marquee_offset: 110,
          },
          commands: [['set_pen', '#020202'], ['clear'], ['update']],
        }),
      ),
      drawBoardCommandsJson: vi.fn(),
    });
    const frameInput = {
      departures: [],
      tone: 'loading' as const,
      headline: 'Loading departures',
      detail: 'Board is starting',
    };
    const initialState = controller.createMarqueeState(frameInput);
    const nextState = await controller.advanceMarqueeState(
      graphics,
      initialState,
      frameInput,
      1,
    );

    await controller.drawBoard(graphics, frameInput, nextState);

    expect(graphics.clear).toHaveBeenCalledTimes(1);
    expect(graphics.update).toHaveBeenCalledTimes(1);
  });

  it('falls back to the stateless bridge when the stateful frame API is unavailable', async () => {
    const advanceAndDrawFrameJson = vi.fn().mockResolvedValue(
      JSON.stringify({
        marquee_state: {
          active_content: {
            text: 'Loading departures',
            interruptible: true,
          },
          pending_content: {
            text: 'Loading departures',
            interruptible: true,
          },
          marquee_offset: 110,
        },
        commands: [['set_pen', '#020202'], ['clear'], ['update']],
      }),
    );
    const controller = createPyScriptPicographicsController({
      advanceAndDrawFrameJson,
      drawBoardCommandsJson: vi.fn(),
    });
    const frameInput = {
      departures: [],
      tone: 'loading' as const,
      headline: 'Loading departures',
      detail: 'Board is starting',
    };
    const initialState = controller.createMarqueeState(frameInput);

    await controller.advanceMarqueeState(
      createGraphics(18),
      initialState,
      frameInput,
      1,
    );

    expect(advanceAndDrawFrameJson).toHaveBeenCalledWith(
      expect.stringContaining('"tone":"loading"'),
      1,
      expect.any(String),
    );
  });
});

function createGraphics(measurement: number) {
  return {
    create_pen: vi.fn((red: number, green: number, blue: number) =>
      `#${toHex(red)}${toHex(green)}${toHex(blue)}`,
    ),
    set_pen: vi.fn(),
    clear: vi.fn(),
    pixel: vi.fn(),
    rectangle: vi.fn(),
    text: vi.fn(),
    measure_text: vi.fn(() => measurement),
    update: vi.fn(),
  };
}

function toHex(value: number) {
  return Math.max(0, Math.min(255, Math.round(value)))
    .toString(16)
    .padStart(2, '0');
}
