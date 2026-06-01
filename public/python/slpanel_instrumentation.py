import json
import time

try:
    import js
except ImportError:
    js = None


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


def summarize_text(value, max_length=48):
    text = value or ""

    if len(text) <= max_length:
        return text

    return text[: max_length - 3] + "..."
