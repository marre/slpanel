import json
import time

try:
    import js
except ImportError:
    js = None


LOGICAL_PANEL_WIDTH = 128
ROW_ONE_Y = 4
ROW_TWO_Y = 18
PANEL_PADDING = 2
LEAD_DEPARTURE_GAP = 5
MARQUEE_SPEED = 18

_JSON_PARSE_CACHE = {
    "frame_input": {"raw": None, "parsed": None},
    "measurements": {"raw": None, "parsed": None},
}
_CURRENT_FRAME_INPUT = None
_CURRENT_MEASUREMENTS = {}
_CURRENT_MARQUEE_STATE = None


def debug_log(event, payload=None):
    if payload is None:
        payload = {}

    if js is not None:
        window = getattr(js, "window", None)

        if not getattr(window, "__slpanelPicographicsDebug", False):
            return

        js.console.log("[slpanel/python]", event, json.dumps(payload))
        return

    print("[slpanel/python]", event, payload)


def is_profile_enabled():
    if js is None:
        return False

    window = getattr(js, "window", None)

    return bool(getattr(window, "__slpanelPicographicsProfile", False))


def profile_now_ms():
    if js is not None:
        performance = getattr(js, "performance", None)

        if performance is not None and hasattr(performance, "now"):
            return float(performance.now())

    return time.perf_counter() * 1000.0


def profile_record_ms(metric, duration_ms):
    if not is_profile_enabled() or js is None:
        return

    profiler = getattr(getattr(js, "window", None), "__slpanelPicographicsProfiler", None)

    if profiler is None or not hasattr(profiler, "recordMs"):
        return

    profiler.recordMs(metric, float(duration_ms))


def profile_record_count(metric, value=1):
    if not is_profile_enabled() or js is None:
        return

    profiler = getattr(getattr(js, "window", None), "__slpanelPicographicsProfiler", None)

    if profiler is None or not hasattr(profiler, "recordCount"):
        return

    profiler.recordCount(metric, value)


def parse_json_cached(cache_name, value):
    cache = _JSON_PARSE_CACHE.get(cache_name)

    if cache is not None and cache.get("raw") == value:
        profile_record_count(f"python.json_cache.{cache_name}.hit")
        return cache.get("parsed")

    started_at = profile_now_ms()
    parsed = json.loads(value)
    profile_record_ms(
        f"python.json_cache.{cache_name}.loads",
        profile_now_ms() - started_at,
    )

    if cache is not None:
        cache["raw"] = value
        cache["parsed"] = parsed

    profile_record_count(f"python.json_cache.{cache_name}.miss")

    return parsed


def summarize_text(value, max_length=48):
    text = value or ""

    if len(text) <= max_length:
        return text

    return text[: max_length - 3] + "..."


def create_marquee_state(frame_input):
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

    debug_log(
        "create_marquee_state",
        {
            "tone": frame_input.get("tone", "loading"),
            "headline": summarize_text(frame_input.get("headline", "")),
            "detail": summarize_text(frame_input.get("detail", "")),
            "active_text": summarize_text(content.get("text", "")),
            "offset": state["marquee_offset"],
        },
    )

    return state


def advance_marquee_state(graphics, marquee_state, frame_input, delta_seconds):
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

    if should_swap_marquee_immediately(active_content, pending_content):
        active_content = pending_content
        marquee_state["marquee_offset"] = LOGICAL_PANEL_WIDTH

    marquee_width = max(graphics.measure_text(active_content.get("text", "")), 1)
    marquee_state["marquee_offset"] -= delta_seconds * MARQUEE_SPEED

    if marquee_state["marquee_offset"] <= -marquee_width:
        marquee_state["marquee_offset"] = LOGICAL_PANEL_WIDTH
        active_content = pending_content

    marquee_state["active_content"] = active_content
    marquee_state["pending_content"] = pending_content

    debug_log(
        "advance_marquee_state",
        {
            "delta_seconds": round(delta_seconds, 4),
            "previous_offset": round(previous_offset, 4),
            "next_offset": round(marquee_state["marquee_offset"], 4),
            "active_text": summarize_text(active_content.get("text", "")),
            "pending_text": summarize_text(pending_content.get("text", "")),
        },
    )

    return marquee_state


def draw_board(graphics, frame_input, marquee_state):
    colors = get_tone_colors(frame_input.get("tone", "loading"))
    departures = frame_input.get("departures", [])

    graphics.set_pen("#020202")
    graphics.clear()

    if frame_input.get("tone") == "live" and departures:
        draw_lead_departure(graphics, departures[0], colors["primary"])
    else:
        graphics.set_pen(colors["primary"])
        graphics.text(
            frame_input.get("headline", ""),
            PANEL_PADDING,
            ROW_ONE_Y,
            LOGICAL_PANEL_WIDTH - PANEL_PADDING * 2,
        )

    graphics.set_pen(colors["primary"])
    graphics.text(
        marquee_state.get("active_content", {}).get("text", ""),
        round(marquee_state.get("marquee_offset", LOGICAL_PANEL_WIDTH)),
        ROW_TWO_Y,
    )
    graphics.update()

    debug_log(
        "draw_board",
        {
            "tone": frame_input.get("tone", "loading"),
            "row_two_text": summarize_text(
                marquee_state.get("active_content", {}).get("text", "")
            ),
            "row_two_offset": round(
                marquee_state.get("marquee_offset", LOGICAL_PANEL_WIDTH),
                4,
            ),
            "departures": len(departures),
        },
    )


def draw_lead_departure(graphics, departure, color):
    line_number = departure.get("line_number") or "--"
    destination = departure.get("destination") or "Unknown"
    display_time = departure.get("display_time") or "Now"
    line_width = graphics.measure_text(line_number)
    time_width = graphics.measure_text(display_time)
    time_x = LOGICAL_PANEL_WIDTH - time_width - PANEL_PADDING
    destination_x = line_width + LEAD_DEPARTURE_GAP
    destination_width = max(0, time_x - destination_x - PANEL_PADDING)

    graphics.set_pen(color)
    graphics.text(line_number, PANEL_PADDING, ROW_ONE_Y)
    graphics.text(destination, destination_x, ROW_ONE_Y, destination_width)
    graphics.text(display_time, time_x, ROW_ONE_Y)


def build_marquee_content(departures, tone, headline, detail):
    if tone == "live" and departures:
        following_departures = [
            format_compact_departure(departure) for departure in departures[1:4]
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


def should_swap_marquee_immediately(active_content, pending_content):
    return active_content.get("interruptible") and active_content.get(
        "text"
    ) != pending_content.get("text")


def format_compact_departure(departure):
    return (
        f"{departure.get('line_number', '')} "
        f"{departure.get('destination', '')} "
        f"{departure.get('display_time', '')}"
    ).strip()


def get_tone_colors(tone):
    if tone == "error":
        return {"primary": "#ffd7a0", "secondary": "#ffbf6b"}
    if tone == "loading":
        return {"primary": "#ffbe64", "secondary": "#ff9b29"}
    if tone == "empty":
        return {"primary": "#ffc978", "secondary": "#ffae43"}
    return {"primary": "#ffb347", "secondary": "#ff9625"}


class RecordingGraphics:
    def __init__(self, measurements=None):
        self.measurements = measurements or {}
        self.commands = []

    def set_pen(self, red_or_color, green=None, blue=None):
        self.commands.append(["set_pen", normalize_pen(red_or_color, green, blue)])

    def clear(self):
        self.commands.append(["clear"])

    def pixel(self, x, y):
        self.commands.append(["pixel", x, y])

    def rectangle(self, x, y, width, height):
        self.commands.append(["rectangle", x, y, width, height])

    def text(self, value, x, y, max_width=None):
        command = ["text", value, x, y]

        if max_width is not None:
            command.append(max_width)

        self.commands.append(command)

    def measure_text(self, value):
        return int(self.measurements.get(value, 0))

    def update(self):
        self.commands.append(["update"])


def create_marquee_state_json(frame_input_json):
    global _CURRENT_FRAME_INPUT, _CURRENT_MARQUEE_STATE

    frame_input = json.loads(frame_input_json)
    _CURRENT_FRAME_INPUT = frame_input
    _CURRENT_MARQUEE_STATE = create_marquee_state(frame_input)
    state_json = json.dumps(_CURRENT_MARQUEE_STATE)

    debug_log(
        "create_marquee_state_json",
        {
            "headline": summarize_text(frame_input.get("headline", "")),
            "result": summarize_text(state_json, 80),
        },
    )

    return state_json


def set_frame_input_json(frame_input_json):
    global _CURRENT_FRAME_INPUT

    _CURRENT_FRAME_INPUT = parse_json_cached("frame_input", frame_input_json)


def set_measurements_json(measurements_json="{}"):
    global _CURRENT_MEASUREMENTS

    _CURRENT_MEASUREMENTS = parse_json_cached("measurements", measurements_json)


def advance_marquee_state_json(
    frame_input_json,
    marquee_state_json,
    delta_seconds,
    measurements_json="{}",
):
    frame_input = parse_json_cached("frame_input", frame_input_json)
    marquee_state = json.loads(marquee_state_json)
    measurements = parse_json_cached("measurements", measurements_json)
    graphics = RecordingGraphics(measurements)

    next_state = advance_marquee_state(
        graphics,
        marquee_state,
        frame_input,
        delta_seconds,
    )

    debug_log(
        "advance_marquee_state_json",
        {
            "delta_seconds": round(delta_seconds, 4),
            "result_offset": round(next_state.get("marquee_offset", 0), 4),
        },
    )

    return json.dumps(next_state)


def draw_board_commands_json(
    frame_input_json,
    marquee_state_json,
    measurements_json="{}",
):
    frame_input = parse_json_cached("frame_input", frame_input_json)
    marquee_state = json.loads(marquee_state_json)
    measurements = parse_json_cached("measurements", measurements_json)
    graphics = RecordingGraphics(measurements)

    draw_board(graphics, frame_input, marquee_state)

    debug_log(
        "draw_board_commands_json",
        {
            "command_count": len(graphics.commands),
            "commands_preview": graphics.commands[:4],
        },
    )

    return json.dumps(graphics.commands)


def advance_and_draw_frame_json(
    frame_input_json,
    marquee_state_json,
    delta_seconds,
    measurements_json="{}",
):
    total_started_at = profile_now_ms()

    frame_input_started_at = total_started_at
    frame_input = parse_json_cached("frame_input", frame_input_json)
    profile_record_ms(
        "python.advance_frame.frame_input_load",
        profile_now_ms() - frame_input_started_at,
    )

    marquee_state_started_at = profile_now_ms()
    marquee_state = json.loads(marquee_state_json)
    profile_record_ms(
        "python.advance_frame.marquee_state_load",
        profile_now_ms() - marquee_state_started_at,
    )

    measurements_started_at = profile_now_ms()
    measurements = parse_json_cached("measurements", measurements_json)
    profile_record_ms(
        "python.advance_frame.measurements_load",
        profile_now_ms() - measurements_started_at,
    )
    profile_record_ms(
        "python.advance_frame.json_loads",
        profile_now_ms() - total_started_at,
    )

    graphics = RecordingGraphics(measurements)

    advance_started_at = profile_now_ms()
    next_state = advance_marquee_state(
        graphics,
        marquee_state,
        frame_input,
        delta_seconds,
    )
    profile_record_ms(
        "python.advance_frame.advance_marquee_state",
        profile_now_ms() - advance_started_at,
    )

    draw_started_at = profile_now_ms()
    draw_board(graphics, frame_input, next_state)
    profile_record_ms(
        "python.advance_frame.draw_board",
        profile_now_ms() - draw_started_at,
    )

    result = {
        "marquee_state": next_state,
        "commands": graphics.commands,
    }

    profile_record_count(
        "python.advance_frame.command_count",
        len(graphics.commands),
    )

    serialize_started_at = profile_now_ms()
    result_json = json.dumps(result)
    profile_record_ms(
        "python.advance_frame.json_dumps",
        profile_now_ms() - serialize_started_at,
    )
    profile_record_ms(
        "python.advance_frame.total",
        profile_now_ms() - total_started_at,
    )

    debug_log(
        "advance_and_draw_frame_json",
        {
            "delta_seconds": round(delta_seconds, 4),
            "result_offset": round(next_state.get("marquee_offset", 0), 4),
            "command_count": len(graphics.commands),
        },
    )

    return result_json


def advance_and_draw_current_frame_json(delta_seconds):
    global _CURRENT_MARQUEE_STATE

    total_started_at = profile_now_ms()
    frame_input = _CURRENT_FRAME_INPUT or {}
    measurements = _CURRENT_MEASUREMENTS or {}

    if _CURRENT_MARQUEE_STATE is None:
        _CURRENT_MARQUEE_STATE = create_marquee_state(frame_input)

    graphics = RecordingGraphics(measurements)

    advance_started_at = profile_now_ms()
    next_state = advance_marquee_state(
        graphics,
        _CURRENT_MARQUEE_STATE,
        frame_input,
        delta_seconds,
    )
    profile_record_ms(
        "python.advance_current_frame.advance_marquee_state",
        profile_now_ms() - advance_started_at,
    )

    draw_started_at = profile_now_ms()
    draw_board(graphics, frame_input, next_state)
    profile_record_ms(
        "python.advance_current_frame.draw_board",
        profile_now_ms() - draw_started_at,
    )

    _CURRENT_MARQUEE_STATE = next_state
    result = {
        "marquee_state": next_state,
        "commands": graphics.commands,
    }

    profile_record_count(
        "python.advance_current_frame.command_count",
        len(graphics.commands),
    )

    serialize_started_at = profile_now_ms()
    result_json = json.dumps(result)
    profile_record_ms(
        "python.advance_current_frame.json_dumps",
        profile_now_ms() - serialize_started_at,
    )
    profile_record_ms(
        "python.advance_current_frame.total",
        profile_now_ms() - total_started_at,
    )

    return result_json


def advance_and_draw_current_frame_batch_json(
    first_delta_seconds,
    next_delta_seconds,
    frame_count,
):
    global _CURRENT_MARQUEE_STATE

    total_started_at = profile_now_ms()
    frame_input = _CURRENT_FRAME_INPUT or {}
    measurements = _CURRENT_MEASUREMENTS or {}
    frames = []
    safe_frame_count = max(1, int(frame_count))

    if _CURRENT_MARQUEE_STATE is None:
      _CURRENT_MARQUEE_STATE = create_marquee_state(frame_input)

    for index in range(safe_frame_count):
        graphics = RecordingGraphics(measurements)
        step_delta_seconds = (
            first_delta_seconds if index == 0 else next_delta_seconds
        )

        next_state = advance_marquee_state(
            graphics,
            _CURRENT_MARQUEE_STATE,
            frame_input,
            step_delta_seconds,
        )
        draw_board(graphics, frame_input, next_state)
        _CURRENT_MARQUEE_STATE = next_state
        frames.append(
            {
                "marquee_state": clone_marquee_state(next_state),
                "commands": list(graphics.commands),
            }
        )

    profile_record_count(
        "python.advance_current_frame_batch.frame_count",
        safe_frame_count,
    )

    serialize_started_at = profile_now_ms()
    result_json = json.dumps(frames)
    profile_record_ms(
        "python.advance_current_frame_batch.json_dumps",
        profile_now_ms() - serialize_started_at,
    )
    profile_record_ms(
        "python.advance_current_frame_batch.total",
        profile_now_ms() - total_started_at,
    )

    return result_json


def clone_marquee_state(marquee_state):
    return {
        "active_content": dict(marquee_state.get("active_content") or {}),
        "pending_content": dict(marquee_state.get("pending_content") or {}),
        "marquee_offset": marquee_state.get("marquee_offset", LOGICAL_PANEL_WIDTH),
    }


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
