"""Device-agnostic board engine for SL panel rendering.

This module renders with the checked-in SL bitmap font
(``sl_font.py``, generated from ``src/font/sl-font.ts``) blitted through
``sl_text.py``. No font install needed on the target: text becomes
``graphics.pixel()``/``graphics.rectangle()`` calls, so any
PicoGraphics-compatible display works, including the Interstate 75 W.

In the browser bridge, ``picographics`` is a compatibility shim; on device,
it is the real hardware implementation.

Integration contracts:
1. Backend input contract (`frame_input` dict):
    - tone: str ("live" | "loading" | "empty" | "error")
    - headline: str
    - detail: str
    - departures: list[dict] where each departure supports:
      - line_number: str
      - destination: str
      - display_time: str
2. Graphics contract (``picographics.PicoGraphics`` compatible):
    - create_pen(red, green, blue) -> pen
    - set_pen(pen)
    - clear()
    - pixel(x, y)
    - rectangle(x, y, width, height)
    - update()
    - optional: commands (list) for recorded-command environments.
3. Timer contract:
    - provide callable now_ms_provider() -> milliseconds.

Use this module on device by wiring your own backend provider, timer source,
and a real ``PicoGraphics`` instance.
"""

from picographics import PicoGraphics

from sl_text import draw_text, measure_text



LOGICAL_PANEL_WIDTH = 128
ROW_ONE_Y = 4
ROW_TWO_Y = 18
PANEL_PADDING = 2
LEAD_DEPARTURE_GAP = 5
MARQUEE_SPEED = 18

BACKGROUND_RGB = (2, 2, 2)
TONE_RGB = {
    "error": {"primary": (255, 215, 160), "secondary": (255, 191, 107)},
    "loading": {"primary": (255, 190, 100), "secondary": (255, 155, 41)},
    "empty": {"primary": (255, 201, 120), "secondary": (255, 174, 67)},
    "live": {"primary": (255, 179, 71), "secondary": (255, 150, 37)},
}


class BackendInputProvider:
    """Adapter for backend data retrieval.

    Implement ``get_frame_input`` to return the backend input contract.
    """

    def get_frame_input(self):
        raise NotImplementedError()


class FrameTimer:
    """Converts a monotonic time source into per-frame delta seconds."""

    def __init__(self, now_ms_provider):
        self.now_ms_provider = now_ms_provider
        self.last_now_ms = None

    def reset(self):
        self.last_now_ms = None

    def next_delta_seconds(self):
        now_ms = float(self.now_ms_provider())

        if self.last_now_ms is None:
            self.last_now_ms = now_ms
            return 0.0

        delta_ms = max(0.0, now_ms - self.last_now_ms)
        self.last_now_ms = now_ms

        return delta_ms / 1000.0


class BoardEngine:
    """Stateful board engine independent of transport and runtime.

    The engine owns mutable frame input and marquee state. Text measurement
    is local (``sl_text``); rendering targets the pixel graphics contract.
    """

    def __init__(self):
        self.frame_input = {}
        self.marquee_state = None
        self.board_key = None

    def set_frame_input(self, frame_input):
        next_frame_input = frame_input or {}
        next_board_key = _build_board_key(next_frame_input)

        self.frame_input = next_frame_input

        if self.board_key != next_board_key:
            self.board_key = next_board_key
            self.marquee_state = None
            return

        self.board_key = next_board_key

        if self.marquee_state is not None:
            self.marquee_state["pending_content"] = build_marquee_content(
                next_frame_input.get("departures", []),
                next_frame_input.get("tone", "loading"),
                next_frame_input.get("headline", ""),
                next_frame_input.get("detail", ""),
            )

    def reset(self):
        self.marquee_state = None
        self.board_key = None

    def set_measurements(self, measurements):
        # Deprecated no-op: text measurement is local (sl_text) since the
        # pixel-blit switch. Kept so old callers don't crash.
        pass

    def apply_backend_input(self, provider):
        self.set_frame_input(provider.get_frame_input())

    def _ensure_marquee_state(self):
        if self.marquee_state is None:
            self.marquee_state = _create_marquee_state(self.frame_input)

        return self.marquee_state

    def draw_current_frame(self, graphics):
        marquee_state = self._ensure_marquee_state()
        _draw_board(graphics, self.frame_input, marquee_state)

        return _build_frame_result(marquee_state, graphics)

    def advance_and_draw_current_frame(self, graphics, delta_seconds):
        safe_delta_seconds = max(0.0, float(delta_seconds))
        marquee_state = self._ensure_marquee_state()
        next_state = _advance_marquee_state(
            marquee_state,
            self.frame_input,
            safe_delta_seconds,
        )
        _draw_board(graphics, self.frame_input, next_state)
        self.marquee_state = next_state

        return _build_frame_result(next_state, graphics)


def _create_marquee_state(frame_input):
    """Create initial marquee state from backend input."""

    content = build_marquee_content(
        frame_input.get("departures", []),
        frame_input.get("tone", "loading"),
        frame_input.get("headline", ""),
        frame_input.get("detail", ""),
    )
    state = {
        "active_content": content,
        "pending_content": content,
        "marquee_offset": LOGICAL_PANEL_WIDTH,
    }

    return state


def _build_board_key(frame_input):
    return f"{frame_input.get('display_name', '')}::{frame_input.get('site_name', '')}"


def _advance_marquee_state(marquee_state, frame_input, delta_seconds):
    """Advance marquee position and content selection by delta seconds."""

    previous_offset = marquee_state.get("marquee_offset", LOGICAL_PANEL_WIDTH)
    pending_content = build_marquee_content(
        frame_input.get("departures", []),
        frame_input.get("tone", "loading"),
        frame_input.get("headline", ""),
        frame_input.get("detail", ""),
    )
    active_content = marquee_state.get("active_content") or pending_content

    if not active_content.get("text"):
        active_content = pending_content

    if _should_swap_marquee_immediately(active_content, pending_content):
        active_content = pending_content
        marquee_state["marquee_offset"] = LOGICAL_PANEL_WIDTH

    marquee_width = max(measure_text(active_content.get("text", "")), 1)
    marquee_state["marquee_offset"] -= delta_seconds * MARQUEE_SPEED

    reset_threshold = -(marquee_width + LOGICAL_PANEL_WIDTH)

    if marquee_state["marquee_offset"] <= reset_threshold:
        marquee_state["marquee_offset"] = LOGICAL_PANEL_WIDTH
        active_content = pending_content

    marquee_state["active_content"] = active_content
    marquee_state["pending_content"] = pending_content

    return marquee_state


def _draw_board(graphics, frame_input, marquee_state):
    """Render one frame using the provided graphics implementation."""

    tone_rgb = _get_tone_rgb(frame_input.get("tone", "loading"))
    departures = frame_input.get("departures", [])
    background_pen = graphics.create_pen(*BACKGROUND_RGB)
    primary_pen = graphics.create_pen(*tone_rgb["primary"])

    graphics.set_pen(background_pen)
    graphics.clear()

    if frame_input.get("tone") == "live" and departures:
        _draw_lead_departure(graphics, departures[0], primary_pen)
    else:
        graphics.set_pen(primary_pen)
        draw_text(
            graphics,
            frame_input.get("headline", ""),
            PANEL_PADDING,
            ROW_ONE_Y,
            max_width=LOGICAL_PANEL_WIDTH - PANEL_PADDING * 2,
        )

    graphics.set_pen(primary_pen)
    draw_text(
        graphics,
        marquee_state.get("active_content", {}).get("text", ""),
        round(marquee_state.get("marquee_offset", LOGICAL_PANEL_WIDTH)),
        ROW_TWO_Y,
    )
    graphics.update()


def _draw_lead_departure(graphics, departure, pen):
    line_number = departure.get("line_number") or "--"
    destination = departure.get("destination") or "Unknown"
    display_time = departure.get("display_time") or "Now"
    line_width = measure_text(line_number)
    time_width = measure_text(display_time)
    time_x = LOGICAL_PANEL_WIDTH - time_width - PANEL_PADDING
    destination_x = line_width + LEAD_DEPARTURE_GAP
    destination_width = max(0, time_x - destination_x - PANEL_PADDING)

    graphics.set_pen(pen)
    draw_text(graphics, line_number, PANEL_PADDING, ROW_ONE_Y)
    draw_text(graphics, destination, destination_x, ROW_ONE_Y, max_width=destination_width)
    draw_text(graphics, display_time, time_x, ROW_ONE_Y)


def build_marquee_content(departures, tone, headline, detail):
    if tone == "live" and departures:
        following_departures = [
            _format_compact_departure(departure) for departure in departures[1:4]
        ]
        return {
            "text": "     ".join(following_departures) or "No later departures",
            "interruptible": False,
        }

    text_parts = [headline or "", detail or ""]
    text = "     ".join([part for part in text_parts if part])

    return {
        "text": text,
        "interruptible": True,
    }


def _should_swap_marquee_immediately(active_content, pending_content):
    return active_content.get("interruptible") and active_content.get(
        "text"
    ) != pending_content.get("text")


def _format_compact_departure(departure):
    return (
        f"{departure.get('line_number', '')} "
        f"{departure.get('destination', '')} "
        f"{departure.get('display_time', '')}"
    ).strip()


def _get_tone_rgb(tone):
    return TONE_RGB.get(tone, TONE_RGB["live"])


def _build_frame_result(marquee_state, graphics):
    result = {
        "marquee_state": marquee_state,
    }

    # Command recording is bridge-specific (browser/PyScript). Device graphics
    # implementations are not expected to expose recorded commands.
    commands = getattr(graphics, "commands", None)

    if commands is not None:
        result["commands"] = commands

    return result
