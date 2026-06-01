type PicographicsProfileUnit = 'ms' | 'count';

interface PicographicsMetricAccumulator {
  samples: number;
  total: number;
  max: number;
  unit: PicographicsProfileUnit;
}

interface PicographicsProfilerSnapshotEntry {
  metric: string;
  unit: PicographicsProfileUnit;
  samples: number;
  total: number;
  avg: number;
  max: number;
}

interface PicographicsProfilerApi {
  flush: () => void;
  recordCount: (metric: string, value?: number) => void;
  recordMs: (metric: string, value: number) => void;
  reset: () => void;
  snapshot: () => PicographicsProfilerSnapshotEntry[];
}

declare global {
  interface Window {
    __slpanelPicographicsProfile?: boolean;
    __slpanelPicographicsProfiler?: PicographicsProfilerApi;
  }
}

const PROFILE_REPORT_INTERVAL_MS = 2000;
const metricAccumulators = new Map<string, PicographicsMetricAccumulator>();
let lastFlushAt = 0;

export function isPicographicsProfilingEnabled() {
  return globalThis.window?.__slpanelPicographicsProfile === true;
}

export function startPicographicsProfile(metric: string) {
  if (!isPicographicsProfilingEnabled()) {
    return NOOP_STOPWATCH;
  }

  ensureProfilerApi();
  const start = now();

  return () => {
    recordPicographicsSample(metric, now() - start, 'ms');
  };
}

export function recordPicographicsCount(metric: string, value = 1) {
  if (!isPicographicsProfilingEnabled()) {
    return;
  }

  ensureProfilerApi();
  recordPicographicsSample(metric, value, 'count');
}

export function flushPicographicsProfiler() {
  if (!isPicographicsProfilingEnabled()) {
    return;
  }

  const snapshot = createProfilerSnapshot();

  if (snapshot.length === 0) {
    return;
  }

  lastFlushAt = now();
  console.groupCollapsed('[slpanel/picographics-profiler] interval report');
  console.table(snapshot);
  console.groupEnd();
}

export function resetPicographicsProfiler() {
  metricAccumulators.clear();
  lastFlushAt = now();
}

function recordPicographicsSample(
  metric: string,
  value: number,
  unit: PicographicsProfileUnit,
) {
  const accumulator = metricAccumulators.get(metric) ?? {
    samples: 0,
    total: 0,
    max: 0,
    unit,
  };

  accumulator.samples += 1;
  accumulator.total += value;
  accumulator.max = Math.max(accumulator.max, value);
  accumulator.unit = unit;

  metricAccumulators.set(metric, accumulator);
  maybeFlushProfiler();
}

function maybeFlushProfiler() {
  if (now() - lastFlushAt < PROFILE_REPORT_INTERVAL_MS) {
    return;
  }

  flushPicographicsProfiler();
}

function createProfilerSnapshot(): PicographicsProfilerSnapshotEntry[] {
  return [...metricAccumulators.entries()]
    .map(([metric, accumulator]) => ({
      metric,
      unit: accumulator.unit,
      samples: accumulator.samples,
      total: roundValue(accumulator.total),
      avg: roundValue(accumulator.total / Math.max(accumulator.samples, 1)),
      max: roundValue(accumulator.max),
    }))
    .sort((left, right) => right.total - left.total);
}

function ensureProfilerApi() {
  const win = globalThis.window;

  if (!win || win.__slpanelPicographicsProfiler) {
    return;
  }

  win.__slpanelPicographicsProfiler = {
    flush: flushPicographicsProfiler,
    recordCount: recordPicographicsCount,
    recordMs(metric, value) {
      if (!isPicographicsProfilingEnabled()) {
        return;
      }

      recordPicographicsSample(metric, value, 'ms');
    },
    reset: resetPicographicsProfiler,
    snapshot: createProfilerSnapshot,
  };
}

function roundValue(value: number) {
  return Math.round(value * 1000) / 1000;
}

function now() {
  return globalThis.performance?.now?.() ?? Date.now();
}

function NOOP_STOPWATCH() {}
