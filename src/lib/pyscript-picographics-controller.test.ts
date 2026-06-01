import { describe, expect, it, vi } from 'vitest';

import { createPyScriptPicographicsController } from '@/lib/pyscript-picographics-controller';

describe('createPyScriptPicographicsController', () => {
  it('advances a frame through the Python bridge', async () => {
    const advanceAndDrawFrameJson = vi
      .fn()
      .mockResolvedValue(
        JSON.stringify([['set_pen', '#020202'], ['clear'], ['update']]),
      );
    const setMeasurementsJson = vi.fn();
    const advanceAndDrawCurrentFrameJson = vi
      .fn()
      .mockResolvedValue(
        JSON.stringify([['set_pen', '#020202'], ['clear'], ['update']]),
      );
    const graphics = createGraphics(24);
    const controller = createPyScriptPicographicsController({
      setMeasurementsJson,
      advanceAndDrawCurrentFrameJson,
      advanceAndDrawFrameJson,
      drawBoardCommandsJson: vi.fn(),
    });

    await controller.advanceFrame(
      graphics,
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
    expect(graphics.clear).toHaveBeenCalledTimes(1);
    expect(graphics.update).toHaveBeenCalledTimes(1);
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

    await controller.drawFrame(graphics, {
      departures: [],
      tone: 'loading',
      headline: 'Loading departures',
      detail: 'Board is starting',
    });

    expect(drawBoardCommandsJson).toHaveBeenCalledWith(
      expect.stringContaining('"tone":"loading"'),
      expect.any(String),
    );
    expect(graphics.set_pen).toHaveBeenCalledWith('#020202');
    expect(graphics.clear).toHaveBeenCalledTimes(1);
    expect(graphics.text).toHaveBeenCalledWith('Loading departures', 2, 4, 124);
    expect(graphics.update).toHaveBeenCalledTimes(1);
  });

  it('reuses commands prepared during frame advancement', async () => {
    const graphics = createGraphics(18);
    const controller = createPyScriptPicographicsController({
      setMeasurementsJson: vi.fn(),
      advanceAndDrawCurrentFrameJson: vi
        .fn()
        .mockResolvedValue(
          JSON.stringify([['set_pen', '#020202'], ['clear'], ['update']]),
        ),
      advanceAndDrawFrameJson: vi
        .fn()
        .mockResolvedValue(
          JSON.stringify([['set_pen', '#020202'], ['clear'], ['update']]),
        ),
      drawBoardCommandsJson: vi.fn(),
    });
    const frameInput = {
      departures: [],
      tone: 'loading' as const,
      headline: 'Loading departures',
      detail: 'Board is starting',
    };
    await controller.advanceFrame(graphics, frameInput, 1);

    await controller.drawFrame(graphics, frameInput);

    expect(graphics.clear).toHaveBeenCalledTimes(2);
    expect(graphics.update).toHaveBeenCalledTimes(2);
  });

  it('falls back to the stateless bridge when the stateful frame API is unavailable', async () => {
    const advanceAndDrawFrameJson = vi
      .fn()
      .mockResolvedValue(
        JSON.stringify([['set_pen', '#020202'], ['clear'], ['update']]),
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
    await controller.advanceFrame(createGraphics(18), frameInput, 1);

    expect(advanceAndDrawFrameJson).toHaveBeenCalledWith(
      expect.stringContaining('"tone":"loading"'),
      1,
      expect.any(String),
    );
  });
});

function createGraphics(measurement: number) {
  return {
    create_pen: vi.fn(
      (red: number, green: number, blue: number) =>
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
