import json

from picographics import PicoGraphics
from board_engine import BoardEngine


_JSON_PARSE_CACHE = {
    "frame_input": {"raw": None, "parsed": None},
}
_ENGINE = BoardEngine()


class RecordingGraphics(PicoGraphics):
    pass


def parse_json_cached(cache_name, value):
    cache = _JSON_PARSE_CACHE.get(cache_name)

    if cache is not None and cache.get("raw") == value:
        return cache.get("parsed")

    parsed = json.loads(value)

    if cache is not None:
        cache["raw"] = value
        cache["parsed"] = parsed

    return parsed


def set_frame_input_json(frame_input_json):
    _ENGINE.set_frame_input(parse_json_cached("frame_input", frame_input_json))


def set_measurements_json(measurements_json):
    # Deprecated no-op: text measurement is local (sl_text) since the
    # pixel-blit switch. Kept so old JS callers don't crash.
    pass


def draw_board_commands_json(frame_input_json, measurements_json="{}"):
    frame_input = parse_json_cached("frame_input", frame_input_json)
    _ENGINE.set_frame_input(frame_input)
    graphics = RecordingGraphics()
    result = _ENGINE.draw_current_frame(graphics)

    return json.dumps(result.get("commands", []))


def advance_and_draw_current_frame_json(delta_seconds):
    step_delta_seconds = max(0.0, float(delta_seconds))
    graphics = RecordingGraphics()
    result = _ENGINE.advance_and_draw_current_frame(
        graphics, step_delta_seconds
    )

    return json.dumps(result.get("commands", []))
