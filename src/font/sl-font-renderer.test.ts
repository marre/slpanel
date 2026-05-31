import { describe, expect, it, vi } from 'vitest';

import type { BitmapFont } from '@/font/sl-font';
import { renderText, renderTextLine } from '@/font/sl-font-renderer';

const SINGLE_PIXEL_FONT: BitmapFont = {
  cellHeight: 1,
  getGlyph(char) {
    if (char !== 'A') {
      return undefined;
    }

    return {
      width: 1,
      rows: ['x'],
    };
  },
};

describe('sl-font-renderer', () => {
  it('draws square cells by default', () => {
    const ctx = createContext();

    renderText(ctx, 'A', 8, 12, {
      font: SINGLE_PIXEL_FONT,
      scale: 4,
    });

    expect(ctx.fillRect).toHaveBeenCalledWith(8, 12, 4, 4);
    expect(ctx.arc).not.toHaveBeenCalled();
    expect(ctx.fill).not.toHaveBeenCalled();
  });

  it('draws circular diode cells when requested', () => {
    const ctx = createContext();

    renderTextLine(ctx, 'A', 8, 12, 16, {
      font: SINGLE_PIXEL_FONT,
      scale: 4,
      pixelShape: 'circle',
    });

    expect(ctx.fillRect).not.toHaveBeenCalled();
    expect(ctx.beginPath).toHaveBeenCalledTimes(1);
    expect(ctx.arc).toHaveBeenCalledTimes(1);
    expect(ctx.fill).toHaveBeenCalledTimes(1);

    const [centerX, centerY, radius, startAngle, endAngle] = ctx.arc.mock.calls[0];

    expect(centerX).toBe(10);
    expect(centerY).toBe(14);
    expect(radius).toBeCloseTo(1.68);
    expect(startAngle).toBe(0);
    expect(endAngle).toBe(Math.PI * 2);
  });
});

function createContext() {
  return {
    fillStyle: '#000000',
    fillRect: vi.fn(),
    beginPath: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
  } as unknown as CanvasRenderingContext2D & {
    fillRect: ReturnType<typeof vi.fn>;
    beginPath: ReturnType<typeof vi.fn>;
    arc: ReturnType<typeof vi.fn>;
    fill: ReturnType<typeof vi.fn>;
  };
}