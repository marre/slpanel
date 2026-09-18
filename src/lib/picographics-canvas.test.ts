import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  DIODE_SCALE,
  PANEL_HEIGHT,
  PANEL_WIDTH,
} from '@/components/display-board-shared';
import { createCanvasPicographics } from '@/lib/picographics-canvas';

const { measureTextMock, renderTextMock, renderTextLineMock } = vi.hoisted(
  () => ({
    measureTextMock: vi.fn(() => 11),
    renderTextMock: vi.fn(),
    renderTextLineMock: vi.fn(),
  }),
);

vi.mock('@/font/sl-font-renderer', () => ({
  measureText: measureTextMock,
  renderText: renderTextMock,
  renderTextLine: renderTextLineMock,
}));

describe('createCanvasPicographics', () => {
  beforeEach(() => {
    measureTextMock.mockClear();
    renderTextMock.mockClear();
    renderTextLineMock.mockClear();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
      function getContext(this: HTMLCanvasElement) {
        return createContext(this);
      },
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('scales pixel operations from logical board units using LED dots', () => {
    const context = createContext();
    const graphics = createCanvasPicographics(context);

    graphics.set_pen(255, 176, 84);
    graphics.clear();
    graphics.pixel(1, 2);

    expect(context.fillRect).toHaveBeenNthCalledWith(
      1,
      0,
      0,
      PANEL_WIDTH,
      PANEL_HEIGHT,
    );
    expect(context.arc).toHaveBeenCalledWith(
      1 * DIODE_SCALE + DIODE_SCALE / 2,
      2 * DIODE_SCALE + DIODE_SCALE / 2,
      expect.any(Number),
      0,
      Math.PI * 2,
    );
    expect(context.arc).toHaveBeenCalledTimes(1);
  });

  it('fills rectangles in a single canvas call', () => {
    const context = createContext();
    const graphics = createCanvasPicographics(context);

    graphics.set_pen(255, 176, 84);
    graphics.rectangle(2, 3, 4, 5);

    expect(context.fillRect).toHaveBeenCalledWith(
      2 * DIODE_SCALE,
      3 * DIODE_SCALE,
      4 * DIODE_SCALE,
      5 * DIODE_SCALE,
    );
  });

  it('delegates text drawing to the bitmap renderer with scaled coordinates', () => {
    const context = createContext();
    const graphics = createCanvasPicographics(context);

    graphics.set_pen('#abcdef');
    graphics.text('Slussen', 2, 3);

    expect(renderTextMock).toHaveBeenCalledWith(
      expect.objectContaining({ canvas: expect.anything() }),
      'Slussen',
      Math.round(2 * DIODE_SCALE),
      Math.round(3 * DIODE_SCALE),
      expect.objectContaining({
        color: '#abcdef',
        gap: 1,
        pixelShape: 'circle',
        scale: DIODE_SCALE,
      }),
    );
  });

  it('delegates clipped text and measurement in logical units', () => {
    const context = createContext();
    const graphics = createCanvasPicographics(context);

    graphics.set_pen('#ffb347');

    expect(graphics.measure_text('17 Hagsätra')).toBe(11);

    graphics.text('17 Hagsätra', 4, 5, 20);

    expect(measureTextMock).toHaveBeenCalledWith(
      '17 Hagsätra',
      expect.objectContaining({
        gap: 1,
        pixelShape: 'circle',
        scale: 1,
      }),
    );
    expect(renderTextLineMock).toHaveBeenCalledWith(
      expect.objectContaining({ canvas: expect.anything() }),
      '17 Hagsätra',
      Math.round(4 * DIODE_SCALE),
      Math.round(5 * DIODE_SCALE),
      Math.max(0, Math.round(20 * DIODE_SCALE)),
      expect.objectContaining({
        color: '#ffb347',
        scale: DIODE_SCALE,
      }),
    );
  });
});

function createContext(canvas?: HTMLCanvasElement) {
  return {
    arc: vi.fn(),
    beginPath: vi.fn(),
    canvas: canvas ?? document.createElement('canvas'),
    fillStyle: '#000000',
    fill: vi.fn(),
    fillRect: vi.fn(),
  } as unknown as CanvasRenderingContext2D & {
    arc: ReturnType<typeof vi.fn>;
    beginPath: ReturnType<typeof vi.fn>;
    canvas: HTMLCanvasElement;
    fill: ReturnType<typeof vi.fn>;
    fillRect: ReturnType<typeof vi.fn>;
  };
}
