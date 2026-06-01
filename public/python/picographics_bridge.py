import json

from picographics import PicoGraphics
from board_engine import (
    BoardEngine,
    FrameTimer,
    advance_marquee_state,
    clone_marquee_state,
    create_marquee_state,
    draw_board,
)
from runtime_instrumentation import (
    debug_log,
    profile_now_ms,
    profile_record_count,
    profile_record_ms,
    summarize_text,
)


_JSON_PARSE_CACHE = {
    "frame_input": {"raw": None, "parsed": None},
    "measurements": {"raw": None, "parsed": None},
}
_ENGINE = BoardEngine()
_FRAME_TIMER = FrameTimer(profile_now_ms)


class RecordingGraphics(PicoGraphics):
    pass


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


def create_marquee_state_json(frame_input_json):
    frame_input = json.loads(frame_input_json)
    _ENGINE.set_frame_input(frame_input)
    _FRAME_TIMER.reset()
    state = _ENGINE.create_marquee_state()
    state_json = json.dumps(state)

    debug_log(
        "create_marquee_state_json",
        {
            "headline": summarize_text(frame_input.get("headline", "")),
            "result": summarize_text(state_json, 80),
        },
    )

    return state_json


def set_frame_input_json(frame_input_json):
    _ENGINE.set_frame_input(parse_json_cached("frame_input", frame_input_json))


def set_measurements_json(measurements_json="{}"):
    _ENGINE.set_measurements(parse_json_cached("measurements", measurements_json))


def advance_marquee_state_json(
    frame_input_json,
    marquee_state_json,
    delta_seconds,
    measurements_json="{}",
):
    frame_input = parse_json_cached("frame_input", frame_input_json)
    marquee_state = json.loads(marquee_state_json)
    measurements = parse_json_cached("measurements", measurements_json)
    graphics = RecordingGraphics(measurements=measurements)

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
    graphics = RecordingGraphics(measurements=measurements)

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

    graphics = RecordingGraphics(measurements=measurements)

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
    total_started_at = profile_now_ms()

    step_delta_seconds = float(delta_seconds)

    if step_delta_seconds < 0:
        step_delta_seconds = 0.0

    if step_delta_seconds == 0:
        step_delta_seconds = _FRAME_TIMER.next_delta_seconds()
    else:
        _FRAME_TIMER.reset()

    graphics = RecordingGraphics(_ENGINE.measurements)

    advance_started_at = profile_now_ms()
    result = _ENGINE.advance_and_draw_current_frame(graphics, step_delta_seconds)
    profile_record_ms(
        "python.advance_current_frame.advance_marquee_state",
        profile_now_ms() - advance_started_at,
    )

    profile_record_ms(
        "python.advance_current_frame.draw_board",
        0,
    )

    profile_record_count(
        "python.advance_current_frame.command_count",
        len(result.get("commands", [])),
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


def clone_marquee_state_json(marquee_state_json):
    return json.dumps(clone_marquee_state(json.loads(marquee_state_json)))


def create_marquee_state_native(frame_input):
    return create_marquee_state(frame_input)
