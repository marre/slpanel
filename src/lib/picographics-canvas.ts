import {
  CLASSIC_BOARD_FONT_OPTIONS,
  DIODE_SCALE,
  PANEL_HEIGHT,
  PANEL_WIDTH,
  type BoardFontOptions,
} from '@/components/display-board-shared';
import {
  measureText,
  renderText,
  renderTextLine,
} from '@/font/sl-font-renderer';
import { SL_FONT } from '@/font/sl-font';
import {
  recordPicographicsCount,
  startPicographicsProfile,
} from '@/lib/picographics-profiler';

export interface PicographicsCanvas {
  create_pen: (red: number, green: number, blue: number) => string;
  set_pen: (redOrColor: string | number, green?: number, blue?: number) => void;
  clear: () => void;
  pixel: (x: number, y: number) => void;
  rectangle: (x: number, y: number, width: number, height: number) => void;
  text: (value: string, x: number, y: number, maxWidth?: number) => void;
  measure_text: (value: string) => number;
  update: () => void;
}

const DEFAULT_FONT_OPTIONS: BoardFontOptions = CLASSIC_BOARD_FONT_OPTIONS;
const TEXT_CACHE_LIMIT = 128;

interface CachedTextSprite {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
}

export function createCanvasPicographics(
  context: CanvasRenderingContext2D,
  options: {
    fontOptions?: BoardFontOptions;
  } = {},
): PicographicsCanvas {
  const fontOptions = options.fontOptions ?? DEFAULT_FONT_OPTIONS;
  const textOptions = {
    ...fontOptions,
    scale: DIODE_SCALE,
  } satisfies BoardFontOptions;
  const measurementOptions = {
    ...fontOptions,
    scale: 1,
  } satisfies BoardFontOptions;
  let currentPen = '#ffb347';
  const textSpriteCache = new Map<string, CachedTextSprite>();

  const applyPen = () => {
    context.fillStyle = currentPen;
  };

  return {
    create_pen(red, green, blue) {
      return colorToHex(red, green, blue);
    },
    set_pen(redOrColor, green, blue) {
      currentPen = normalizeColor(redOrColor, green, blue);
      applyPen();
    },
    clear() {
      applyPen();
      context.fillRect(0, 0, PANEL_WIDTH, PANEL_HEIGHT);
    },
    pixel(x, y) {
      applyPen();
      drawLedPixel(
        context,
        Math.round(x * DIODE_SCALE),
        Math.round(y * DIODE_SCALE),
        DIODE_SCALE,
      );
    },
    rectangle(x, y, width, height) {
      applyPen();
      drawLedRectangle(
        context,
        Math.round(x),
        Math.round(y),
        Math.max(0, Math.round(width)),
        Math.max(0, Math.round(height)),
      );
    },
    text(value, x, y, maxWidth) {
      applyPen();

      const sprite = getOrCreateTextSprite(value, maxWidth);

      if (sprite && typeof context.drawImage === 'function') {
        const stopBlitProfile = startPicographicsProfile('canvas.text.blit');
        context.drawImage(
          sprite.canvas,
          Math.round(x * DIODE_SCALE),
          Math.round(y * DIODE_SCALE),
          sprite.width,
          sprite.height,
        );
        stopBlitProfile();
        return;
      }

      recordPicographicsCount('canvas.text.fallback');

      if (maxWidth === undefined) {
        renderText(
          context,
          value,
          Math.round(x * DIODE_SCALE),
          Math.round(y * DIODE_SCALE),
          {
            ...textOptions,
            color: currentPen,
          },
        );
        return;
      }

      renderTextLine(
        context,
        value,
        Math.round(x * DIODE_SCALE),
        Math.round(y * DIODE_SCALE),
        Math.max(0, Math.round(maxWidth * DIODE_SCALE)),
        {
          ...textOptions,
          color: currentPen,
        },
      );
    },
    measure_text(value) {
      return measureText(value, measurementOptions);
    },
    update() {},
  };

  function getOrCreateTextSprite(value: string, maxWidth?: number) {
    if (!value) {
      return null;
    }

    const cacheKey = buildTextCacheKey(value, currentPen, maxWidth);
    const cachedSprite = textSpriteCache.get(cacheKey);

    if (cachedSprite) {
      recordPicographicsCount('canvas.text.sprite.cacheHit');
      textSpriteCache.delete(cacheKey);
      textSpriteCache.set(cacheKey, cachedSprite);
      return cachedSprite;
    }

    recordPicographicsCount('canvas.text.sprite.cacheMiss');
    const stopBuildProfile = startPicographicsProfile(
      'canvas.text.sprite.build',
    );
    const sprite = createTextSprite(
      context,
      value,
      currentPen,
      maxWidth,
      textOptions,
      measurementOptions,
    );
    stopBuildProfile();

    if (!sprite) {
      return null;
    }

    textSpriteCache.set(cacheKey, sprite);

    if (textSpriteCache.size > TEXT_CACHE_LIMIT) {
      const oldestKey = textSpriteCache.keys().next().value;

      if (typeof oldestKey === 'string') {
        textSpriteCache.delete(oldestKey);
      }
    }

    return sprite;
  }
}

function buildTextCacheKey(value: string, color: string, maxWidth?: number) {
  return `${color}|${maxWidth ?? 'full'}|${value}`;
}

function createTextSprite(
  context: CanvasRenderingContext2D,
  value: string,
  color: string,
  maxWidth: number | undefined,
  textOptions: BoardFontOptions,
  measurementOptions: BoardFontOptions,
) {
  const doc = context.canvas?.ownerDocument ?? globalThis.document;

  if (!doc) {
    return null;
  }

  const spriteCanvas = doc.createElement('canvas');
  const spriteContext = spriteCanvas.getContext('2d');

  if (!spriteContext) {
    return null;
  }

  const logicalWidth = Math.max(
    1,
    Math.min(
      measureText(value, measurementOptions),
      maxWidth ?? Number.POSITIVE_INFINITY,
    ),
  );
  const width = Math.max(1, Math.ceil(logicalWidth * DIODE_SCALE));
  const logicalHeight = Math.max(
    textOptions.font?.cellHeight ?? 10,
    estimateLogicalTextHeight(
      value,
      measurementOptions.font,
      measurementOptions.gap,
      maxWidth,
    ),
  );
  const height = Math.max(1, logicalHeight * DIODE_SCALE);

  spriteCanvas.width = width;
  spriteCanvas.height = height;

  if (maxWidth === undefined) {
    renderText(spriteContext, value, 0, 0, {
      ...textOptions,
      color,
    });
  } else {
    renderTextLine(spriteContext, value, 0, 0, width, {
      ...textOptions,
      color,
    });
  }

  return {
    canvas: spriteCanvas,
    width,
    height,
  } satisfies CachedTextSprite;
}

function estimateLogicalTextHeight(
  text: string,
  font: BoardFontOptions['font'],
  gap: number | undefined,
  maxWidth?: number,
) {
  const resolvedFont = font ?? SL_FONT;
  const resolvedGap = gap ?? 1;

  let maxRows = resolvedFont.cellHeight;
  let usedWidth = 0;

  for (const char of text) {
    const glyph = resolvedFont.getGlyph(char);
    const glyphWidth = glyph ? glyph.width : 3;
    const glyphRows = glyph?.rows.length ?? resolvedFont.cellHeight;
    const nextWidth =
      usedWidth === 0 ? glyphWidth : usedWidth + resolvedGap + glyphWidth;

    if (maxWidth !== undefined && nextWidth > maxWidth) {
      break;
    }

    usedWidth = nextWidth;
    maxRows = Math.max(maxRows, glyphRows);
  }

  return maxRows;
}

function drawLedRectangle(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  for (let row = 0; row < height; row += 1) {
    for (let column = 0; column < width; column += 1) {
      drawLedPixel(
        context,
        Math.round((x + column) * DIODE_SCALE),
        Math.round((y + row) * DIODE_SCALE),
        DIODE_SCALE,
      );
    }
  }
}

function drawLedPixel(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
) {
  context.beginPath();
  context.arc(
    x + size / 2,
    y + size / 2,
    Math.max(0.5, size * 0.42),
    0,
    Math.PI * 2,
  );
  context.fill();
}

function normalizeColor(
  redOrColor: string | number,
  green?: number,
  blue?: number,
) {
  if (typeof redOrColor === 'string') {
    return redOrColor;
  }

  if (typeof green !== 'number' || typeof blue !== 'number') {
    const value = clampColor(redOrColor);
    return colorToHex(value, value, value);
  }

  return colorToHex(redOrColor, green, blue);
}

function colorToHex(red: number, green: number, blue: number) {
  return `#${toHex(red)}${toHex(green)}${toHex(blue)}`;
}

function toHex(value: number) {
  return clampColor(value).toString(16).padStart(2, '0');
}

function clampColor(value: number) {
  return Math.max(0, Math.min(255, Math.round(value)));
}
