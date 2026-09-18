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

export function createCanvasPicographics(
  context: CanvasRenderingContext2D,
  options: { fontOptions?: BoardFontOptions } = {},
): PicographicsCanvas {
  const fontOptions = options.fontOptions ?? CLASSIC_BOARD_FONT_OPTIONS;
  const textRenderOptions = { ...fontOptions, scale: DIODE_SCALE };
  const measureOptions = { ...fontOptions, scale: 1 };
  let currentPen = '#ffb347';

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
      drawPixel(context, Math.round(x * DIODE_SCALE), Math.round(y * DIODE_SCALE), DIODE_SCALE);
    },

    rectangle(x, y, width, height) {
      applyPen();
      drawRectangle(
        context,
        Math.round(x),
        Math.round(y),
        Math.max(0, Math.round(width)),
        Math.max(0, Math.round(height)),
      );
    },

    text(value, x, y, maxWidth) {
      applyPen();

      if (maxWidth !== undefined) {
        renderTextLine(
          context,
          value,
          Math.round(x * DIODE_SCALE),
          Math.round(y * DIODE_SCALE),
          Math.max(0, Math.round(maxWidth * DIODE_SCALE)),
          { ...textRenderOptions, color: currentPen },
        );
      } else {
        renderText(context, value, Math.round(x * DIODE_SCALE), Math.round(y * DIODE_SCALE), {
          ...textRenderOptions,
          color: currentPen,
        });
      }
    },

    measure_text(value) {
      return measureText(value, measureOptions);
    },

    update() {},
  };
}

function drawPixel(context: CanvasRenderingContext2D, x: number, y: number, size: number) {
  context.beginPath();
  context.arc(x + size / 2, y + size / 2, Math.max(0.5, size * 0.42), 0, Math.PI * 2);
  context.fill();
}

function drawRectangle(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  for (let row = 0; row < height; row += 1) {
    for (let col = 0; col < width; col += 1) {
      drawPixel(
        context,
        Math.round((x + col) * DIODE_SCALE),
        Math.round((y + row) * DIODE_SCALE),
        DIODE_SCALE,
      );
    }
  }
}

function normalizeColor(redOrColor: string | number, green?: number, blue?: number) {
  if (typeof redOrColor === 'string') {
    return redOrColor;
  }

  if (typeof green !== 'number' || typeof blue !== 'number') {
    const value = clamp(redOrColor);
    return colorToHex(value, value, value);
  }

  return colorToHex(redOrColor, green, blue);
}

function colorToHex(red: number, green: number, blue: number) {
  return `#${hex(red)}${hex(green)}${hex(blue)}`;
}

function hex(value: number) {
  return clamp(value).toString(16).padStart(2, '0');
}

function clamp(value: number) {
  return Math.max(0, Math.min(255, Math.round(value)));
}
