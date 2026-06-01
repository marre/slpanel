import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  DIODE_SCALE,
  PANEL_HEIGHT,
  PANEL_WIDTH,
} from '@/components/display-board-shared';
import { SL_FONT } from '@/font/sl-font';
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

  it('scales pixel and rectangle operations from logical board units using LED dots', () => {
    const context = createContext();
    const graphics = createCanvasPicographics(context);

    graphics.set_pen(255, 176, 84);
    graphics.clear();
    graphics.pixel(1, 2);
    graphics.rectangle(2, 3, 4, 5);

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
    expect(context.arc).toHaveBeenCalledTimes(21);
  });

  it('delegates text drawing to the bitmap renderer with scaled coordinates', () => {
    const context = createContext();
    const graphics = createCanvasPicographics(context);

    graphics.set_pen('#abcdef');
    graphics.text('Slussen', 2, 3);

    expect(renderTextMock).toHaveBeenCalledWith(
      expect.objectContaining({ canvas: expect.anything() }),
      'Slussen',
      0,
      0,
      expect.objectContaining({
        color: '#abcdef',
        gap: 1,
        pixelShape: 'circle',
        scale: DIODE_SCALE,
      }),
    );
    expect(context.drawImage).toHaveBeenCalledTimes(1);
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
      0,
      0,
      11 * DIODE_SCALE,
      expect.objectContaining({
        color: '#ffb347',
        scale: DIODE_SCALE,
      }),
    );
    expect(context.drawImage).toHaveBeenCalledTimes(1);
  });

  it('reuses cached text sprites for repeated text draws', () => {
    const context = createContext();
    const graphics = createCanvasPicographics(context);

    graphics.set_pen('#ffb347');
    graphics.text('Slussen', 2, 3);
    graphics.text('Slussen', 4, 3);

    expect(renderTextMock).toHaveBeenCalledTimes(1);
    expect(context.drawImage).toHaveBeenCalledTimes(2);
  });

  it('allocates sprite height for descenders to avoid clipping', () => {
    const context = createContext();
    const graphics = createCanvasPicographics(context);

    graphics.set_pen('#ffb347');
    graphics.text('y', 2, 3);

    const drawImageCall = context.drawImage.mock.calls[0];
    const glyphRows = SL_FONT.getGlyph('y')?.rows.length ?? SL_FONT.cellHeight;

    expect(drawImageCall[4]).toBe(glyphRows * DIODE_SCALE);
  });
});

function createContext(canvas?: HTMLCanvasElement) {
  return {
    arc: vi.fn(),
    beginPath: vi.fn(),
    canvas: canvas ?? document.createElement('canvas'),
    drawImage: vi.fn(),
    fillStyle: '#000000',
    fill: vi.fn(),
    fillRect: vi.fn(),
  } as unknown as CanvasRenderingContext2D & {
    arc: ReturnType<typeof vi.fn>;
    beginPath: ReturnType<typeof vi.fn>;
    canvas: HTMLCanvasElement;
    drawImage: ReturnType<typeof vi.fn>;
    fill: ReturnType<typeof vi.fn>;
    fillRect: ReturnType<typeof vi.fn>;
  };
}
