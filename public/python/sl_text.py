"""Measure and blit SL bitmap text with a PicoGraphics-compatible graphics.

Port of src/font/sl-font-renderer.ts measure/render. Lit font pixels are
emitted as one graphics.pixel() call per horizontal lit run
(pixel(x0, y, run_length)) so the command count tracks lit runs, not dots.
"""

from sl_font import GAP, UNKNOWN_ADVANCE, get_glyph, glyph_width


def measure_text(value, gap=GAP):
    total = 0
    count = 0

    for char in value:
        glyph = get_glyph(char)
        total += glyph_width(glyph) if glyph is not None else UNKNOWN_ADVANCE
        count += 1

    if count > 1:
        total += (count - 1) * gap

    return total


def draw_text(graphics, value, x, y, max_width=None, gap=GAP):
    cx = x

    for char in value:
        glyph = get_glyph(char)
        width = glyph_width(glyph) if glyph is not None else UNKNOWN_ADVANCE
        char_width = width + gap

        if max_width is not None and cx + char_width - gap > x + max_width:
            break

        if glyph is not None:
            _blit_glyph(graphics, glyph, width, cx, y)

        cx += char_width


def _blit_glyph(graphics, glyph, width, x, y):
    rows = glyph[1:]
    mask_base = 0x80
    pixel = graphics.pixel

    for dy in range(len(rows)):
        row = rows[dy]
        run_start = -1

        for dx in range(width):
            if row & (mask_base >> dx):
                if run_start < 0:
                    run_start = dx
            elif run_start >= 0:
                pixel(x + run_start, y + dy, dx - run_start)
                run_start = -1

        if run_start >= 0:
            pixel(x + run_start, y + dy, width - run_start)
