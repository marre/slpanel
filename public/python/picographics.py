from sl_text import measure_text as _local_measure_text


class PicoGraphics:
    """PicoGraphics-compatible fake for browser bridge/testing.

    Text measurement is local (sl_text) so the browser preview matches the
    device pixel path. Accepts arbitrary constructor args/kwargs so call
    sites can look like device code.
    """

    def __init__(self, *args, **kwargs):
        self.commands = []
        self._init_args = args
        self._init_kwargs = kwargs

    def set_measurements(self, measurements):
        # Deprecated no-op: measurement is local since the pixel-blit switch.
        pass

    # PicoGraphics-style pen creation. The fake returns CSS hex values so the
    # TypeScript bridge can replay commands on the canvas implementation.
    def create_pen(self, red, green, blue):
        return color_to_hex(red, green, blue)

    def set_pen(self, red_or_color, green=None, blue=None):
        self.commands.append(["set_pen", normalize_pen(red_or_color, green, blue)])

    def clear(self):
        self.commands.append(["clear"])

    def pixel(self, x, y):
        self.commands.append(["pixel", x, y])

    def rectangle(self, x, y, width, height):
        self.commands.append(["rectangle", x, y, width, height])

    def text(
        self,
        value,
        x,
        y,
        wordwrap=0,
        scale=1,
        angle=0,
        spacing=0,
        fixed_width=False,
    ):
        command = ["text", value, x, y]

        if wordwrap:
            command.append(wordwrap)

        self.commands.append(command)

    def measure_text(self, value, scale=1, spacing=0, fixed_width=False):
        measured = _local_measure_text(str(value))
        safe_scale = max(1, int(round(scale)))

        return measured * safe_scale

    def update(self):
        self.commands.append(["update"])


def normalize_pen(red_or_color, green=None, blue=None):
    if isinstance(red_or_color, str):
        return red_or_color

    if green is None or blue is None:
        value = clamp_color(red_or_color)
        return color_to_hex(value, value, value)

    return color_to_hex(red_or_color, green, blue)


def color_to_hex(red, green, blue):
    return f"#{to_hex(red)}{to_hex(green)}{to_hex(blue)}"


def to_hex(value):
    return f"{clamp_color(value):02x}"


def clamp_color(value):
    return max(0, min(255, int(round(value))))
