/**
 * Canvas renderer for the SL bitmap font.
 *
 * Usage:
 *
 *   const ctx = canvas.getContext('2d')!;
 *   renderText(ctx, 'Centralstationen', 0, 0, { scale: 2, color: '#FF9900' });
 *   const w = measureText('17', { scale: 2 });
 */

import { CELL_HEIGHT, getGlyph } from './sl-font';

export interface RenderOptions {
  /**
   * Pixel scale factor applied to each font pixel.
   * At scale 1 each glyph is CELL_HEIGHT (10) canvas pixels tall.
   * At scale 2 each glyph is 20 canvas pixels tall, etc.
   * Default: 1
   */
  scale?: number;

  /**
   * Foreground colour for lit pixels.
   * Default: '#FF9900' (amber, matching classic SL LED boards)
   */
  color?: string;

  /**
   * Horizontal gap between glyphs in font pixels (before scaling).
   * Default: 1
   */
  gap?: number;
}

// ---------------------------------------------------------------------------
// measureText
// ---------------------------------------------------------------------------

/**
 * Returns the total width in canvas pixels of the rendered string.
 * Unknown characters are treated as a 3-pixel-wide gap.
 */
export function measureText(
  text: string,
  options?: Pick<RenderOptions, 'scale' | 'gap'>,
): number {
  const scale = options?.scale ?? 1;
  const gap = options?.gap ?? 1;

  let fontPixels = 0;
  let glyphCount = 0;

  for (const char of text) {
    const glyph = getGlyph(char);
    fontPixels += glyph ? glyph.width : 3;
    glyphCount++;
  }

  // Add inter-glyph gaps (one between each pair of adjacent glyphs).
  fontPixels += Math.max(0, glyphCount - 1) * gap;

  return fontPixels * scale;
}

// ---------------------------------------------------------------------------
// renderText
// ---------------------------------------------------------------------------

/**
 * Renders `text` onto `ctx` with the top-left of the first character at
 * canvas coordinates (`x`, `y`).
 *
 * The canvas coordinate system is assumed to be 1:1 with font pixels, then
 * scaled by the `scale` option.  Descender rows are painted below
 * `y + CELL_HEIGHT * scale`.
 *
 * The caller is responsible for clearing or compositing the background.
 */
export function renderText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  options?: RenderOptions,
): void {
  const scale = options?.scale ?? 1;
  const color = options?.color ?? '#FF9900';
  const gap = options?.gap ?? 1;

  ctx.fillStyle = color;

  let cx = x;

  for (const char of text) {
    const glyph = getGlyph(char);

    if (!glyph) {
      // Unknown character: advance by a narrow space.
      cx += (3 + gap) * scale;
      continue;
    }

    const { rows, width } = glyph;

    for (let row = 0; row < rows.length; row++) {
      const rowStr = rows[row];
      const py = y + row * scale;
      for (let col = 0; col < rowStr.length; col++) {
        if (rowStr[col] === 'x') {
          ctx.fillRect(cx + col * scale, py, scale, scale);
        }
      }
    }

    cx += (width + gap) * scale;
  }
}

// ---------------------------------------------------------------------------
// renderTextLine (convenience: renders up to maxWidth, returns chars drawn)
// ---------------------------------------------------------------------------

/**
 * Renders as many characters from `text` as fit within `maxWidth` canvas
 * pixels, starting at (`x`, `y`).
 *
 * Returns the number of characters actually drawn.
 */
export function renderTextLine(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  options?: RenderOptions,
): number {
  const scale = options?.scale ?? 1;
  const gap = options?.gap ?? 1;

  let cx = x;
  let drawn = 0;

  for (const char of text) {
    const glyph = getGlyph(char);
    const charWidth = ((glyph ? glyph.width : 3) + gap) * scale;

    if (cx + charWidth - gap * scale > x + maxWidth) break;

    if (glyph) {
      const { rows, width } = glyph;
      const color = options?.color ?? '#FF9900';
      ctx.fillStyle = color;

      for (let row = 0; row < rows.length; row++) {
        const rowStr = rows[row];
        const py = y + row * scale;
        for (let col = 0; col < rowStr.length; col++) {
          if (rowStr[col] === 'x') {
            ctx.fillRect(cx + col * scale, py, scale, scale);
          }
        }
      }

      cx += (width + gap) * scale;
    } else {
      cx += (3 + gap) * scale;
    }

    drawn++;
  }

  return drawn;
}

// ---------------------------------------------------------------------------
// Utility: cell height in canvas pixels
// ---------------------------------------------------------------------------

/** Returns CELL_HEIGHT multiplied by the given scale. */
export function cellHeight(scale = 1): number {
  return CELL_HEIGHT * scale;
}
