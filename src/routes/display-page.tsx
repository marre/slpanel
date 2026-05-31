import { startTransition, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import type { DepartureRecord, DisplayRecord } from '@/api/types';
import { DisplayBoard } from '@/components/display-board';
import { ConfigApiError, getDisplay, listDepartures } from '@/lib/config-api';

const DEPARTURES_FORECAST_MINUTES = 240;
const DEMO_LAST_UPDATED_AT = Date.parse('2026-05-29T12:00:00Z');

const DEMO_DISPLAY: DisplayRecord = {
  id: 'demo-board',
  owner_id: 'demoOwn1',
  display_id: 'demoBoard123',
  name: 'Demo board preview',
  site_id: '9192',
  site_name: 'Slussen',
  refresh_interval: 45,
  line_numbers: ['17', '18'],
  directions: ['Hagsatra'],
  modes: ['METRO'],
};

const DEMO_DEPARTURES: DepartureRecord[] = [
  {
    line_number: '17',
    destination: 'Hagsatra',
    display_time: '1 min',
    minutes_until_departure: 1,
    scheduled_at: '2026-05-29T12:01:00Z',
    expected_at: '2026-05-29T12:01:00Z',
    transport_mode: 'METRO',
    platform: '2',
    state: 'EXPECTED',
  },
  {
    line_number: '18',
    destination: 'Farsta strand',
    display_time: '4 min',
    minutes_until_departure: 4,
    scheduled_at: '2026-05-29T12:04:00Z',
    expected_at: '2026-05-29T12:04:00Z',
    transport_mode: 'METRO',
    platform: '2',
    state: 'EXPECTED',
  },
  {
    line_number: '17',
    destination: 'Skarpnack',
    display_time: '7 min',
    minutes_until_departure: 7,
    scheduled_at: '2026-05-29T12:07:00Z',
    expected_at: '2026-05-29T12:07:00Z',
    transport_mode: 'METRO',
    platform: '2',
    state: 'EXPECTED',
  },
  {
    line_number: '18',
    destination: 'Farsta strand',
    display_time: '11 min',
    minutes_until_departure: 11,
    scheduled_at: '2026-05-29T12:11:00Z',
    expected_at: '2026-05-29T12:11:00Z',
    transport_mode: 'METRO',
    platform: '2',
    state: 'EXPECTED',
  },
];

type BoardTone = 'live' | 'loading' | 'empty' | 'error';

export function DisplayPage() {
  const { displayId } = useParams();
  const isDemoBoard = displayId === 'demo-board';
  const [display, setDisplay] = useState<DisplayRecord | null>(null);
  const [departures, setDepartures] = useState<DepartureRecord[]>([]);
  const [isLoadingDisplay, setIsLoadingDisplay] = useState(!isDemoBoard);
  const [isLoadingDepartures, setIsLoadingDepartures] = useState(false);
  const [displayError, setDisplayError] = useState<string | null>(null);
  const [departuresError, setDeparturesError] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);

  useEffect(() => {
    if (isDemoBoard || !displayId) {
      return;
    }

    const controller = new AbortController();

    startTransition(() => {
      setIsLoadingDisplay(true);
      setDisplayError(null);
    });

    void getDisplay(displayId, controller.signal)
      .then((nextDisplay) => {
        setDisplay(nextDisplay);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }

        setDisplay(null);
        setDisplayError(
          readErrorMessage(error, 'Could not load this display.'),
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsLoadingDisplay(false);
        }
      });

    return () => {
      controller.abort();
    };
  }, [displayId, isDemoBoard]);

  const activeDisplay = isDemoBoard ? DEMO_DISPLAY : display;
  const activeDepartures = isDemoBoard ? DEMO_DEPARTURES : departures;
  const activeDisplayError = isDemoBoard ? null : displayError;
  const activeDeparturesError = isDemoBoard ? null : departuresError;
  const activeLoadingDisplay = isDemoBoard ? false : isLoadingDisplay;
  const activeLoadingDepartures = isDemoBoard ? false : isLoadingDepartures;
  const activeLastUpdatedAt = isDemoBoard
    ? DEMO_LAST_UPDATED_AT
    : lastUpdatedAt;

  useEffect(() => {
    if (isDemoBoard || !activeDisplay?.site_id) {
      startTransition(() => {
        setDepartures([]);
        setDeparturesError(null);
        setIsLoadingDepartures(false);
      });

      return;
    }

    let cancelled = false;
    let inFlightController: AbortController | null = null;

    const loadDeparturesForDisplay = async () => {
      inFlightController?.abort();

      const controller = new AbortController();
      inFlightController = controller;

      startTransition(() => {
        setIsLoadingDepartures(true);
        setDeparturesError(null);
      });

      try {
        const nextDepartures = await listDepartures(
          activeDisplay.site_id ?? '',
          {
            lines: activeDisplay.line_numbers,
            directions: activeDisplay.directions,
            modes: activeDisplay.modes,
            forecast: DEPARTURES_FORECAST_MINUTES,
            signal: controller.signal,
          },
        );

        if (cancelled || controller.signal.aborted) {
          return;
        }

        setDepartures(nextDepartures);
        setLastUpdatedAt(Date.now());
      } catch (error: unknown) {
        if (cancelled || controller.signal.aborted) {
          return;
        }

        setDeparturesError(
          readErrorMessage(error, 'Could not refresh live departures.'),
        );
      } finally {
        if (!cancelled && !controller.signal.aborted) {
          setIsLoadingDepartures(false);
        }
      }
    };

    void loadDeparturesForDisplay();

    const refreshIntervalId = window.setInterval(() => {
      void loadDeparturesForDisplay();
    }, activeDisplay.refresh_interval * 1000);

    return () => {
      cancelled = true;
      inFlightController?.abort();
      window.clearInterval(refreshIntervalId);
    };
  }, [
    activeDisplay?.directions,
    activeDisplay?.id,
    activeDisplay?.line_numbers,
    activeDisplay?.modes,
    activeDisplay?.refresh_interval,
    activeDisplay?.site_id,
    isDemoBoard,
  ]);

  const boardState = useMemo(
    () =>
      deriveBoardState({
        display: activeDisplay,
        departures: activeDepartures,
        displayError: activeDisplayError,
        departuresError: activeDeparturesError,
        isLoadingDisplay: activeLoadingDisplay,
        isLoadingDepartures: activeLoadingDepartures,
      }),
    [
      activeDisplay,
      activeDepartures,
      activeDeparturesError,
      activeDisplayError,
      activeLoadingDepartures,
      activeLoadingDisplay,
    ],
  );

  const nextDeparture = activeDepartures[0] ?? null;
  const displayName =
    activeDisplay?.name || activeDisplay?.display_id || 'Unknown board';
  const stopName =
    activeDisplay?.site_name || activeDisplay?.site_id || 'No stop configured';

  return (
    <section className="space-y-8">
      <div className="space-y-3">
        <p className="text-xs uppercase tracking-[0.35em] text-[var(--muted-text)]">
          Phase 5 display UI
        </p>
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="space-y-3">
            <h2 className="max-w-4xl text-3xl font-semibold leading-tight text-[var(--panel-text)] md:text-5xl">
              {displayName}
            </h2>
            <p className="max-w-3xl text-sm leading-7 text-[var(--muted-text)] md:text-base">
              The public board now renders the custom SL bitmap font on a fixed
              128x32 panel, keeps the next departure pinned on row one, and
              scrolls the following departures across row two.
            </p>
          </div>

          <div className="flex flex-wrap gap-3 text-xs uppercase tracking-[0.24em] text-[var(--muted-text)]">
            <span className="rounded-full border border-[var(--panel-border)] bg-black/20 px-4 py-2">
              Stop {stopName}
            </span>
            <span className="rounded-full border border-[var(--panel-border)] bg-black/20 px-4 py-2">
              Refreshes every{' '}
              {activeDisplay?.refresh_interval ?? DEMO_DISPLAY.refresh_interval}{' '}
              seconds
            </span>
            {isDemoBoard ? (
              <span className="rounded-full border border-[var(--panel-border)] bg-[var(--panel-text)]/10 px-4 py-2 text-[var(--panel-text)]">
                Demo mode
              </span>
            ) : null}
          </div>
        </div>
      </div>

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.65fr)] xl:items-start">
        <div className="space-y-5">
          <DisplayBoard
            displayName={displayName}
            siteName={activeDisplay?.site_name ?? null}
            departures={activeDepartures}
            tone={boardState.tone}
            headline={boardState.headline}
            detail={boardState.detail}
          />

          <div className="grid gap-4 md:grid-cols-3">
            <StatCard
              label="Next train"
              value={
                nextDeparture
                  ? `${nextDeparture.line_number} ${nextDeparture.destination}`
                  : boardState.headline
              }
              detail={
                nextDeparture ? nextDeparture.display_time : boardState.detail
              }
            />
            <StatCard
              label="Active filters"
              value={formatFilterSummary(activeDisplay)}
              detail={
                activeDisplay?.modes.length
                  ? activeDisplay.modes.join(', ')
                  : 'All transport modes'
              }
            />
            <StatCard
              label="Board status"
              value={boardState.statusLabel}
              detail={
                activeLastUpdatedAt
                  ? `Last updated ${formatTimestamp(activeLastUpdatedAt)}`
                  : 'Waiting for the first live refresh'
              }
            />
          </div>
        </div>

        <aside className="space-y-4 rounded-[2rem] border border-[var(--panel-border)] bg-black/18 p-5">
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted-text)]">
              Board diagnostics
            </p>
            <h3 className="text-xl font-semibold text-[var(--panel-text)]">
              Live state and filter context
            </h3>
            <p className="text-sm leading-6 text-[var(--muted-text)]">
              The public board fetches one display definition, then refreshes
              its departure feed on the configured cadence while preserving the
              board when a single refresh fails.
            </p>
          </div>

          <dl className="space-y-3 text-sm text-[var(--app-text)]">
            <DetailRow
              label="Display id"
              value={activeDisplay?.id ?? displayId ?? 'unknown'}
            />
            <DetailRow label="Stop" value={stopName} />
            <DetailRow
              label="Line filter"
              value={activeDisplay?.line_numbers.join(', ') || 'All lines'}
            />
            <DetailRow
              label="Direction filter"
              value={activeDisplay?.directions.join(', ') || 'All directions'}
            />
            <DetailRow
              label="Mode filter"
              value={activeDisplay?.modes.join(', ') || 'All modes'}
            />
            <DetailRow label="Board message" value={boardState.detail} />
          </dl>

          {!isDemoBoard ? (
            <Link
              to="/config"
              className="inline-flex rounded-full border border-[var(--panel-border)] px-4 py-2 text-sm text-[var(--panel-text)] transition hover:border-[var(--panel-text)]/70 hover:bg-[var(--panel-text)]/8"
            >
              Open config workspace
            </Link>
          ) : null}
        </aside>
      </div>
    </section>
  );
}

function deriveBoardState(input: {
  display: DisplayRecord | null;
  departures: DepartureRecord[];
  displayError: string | null;
  departuresError: string | null;
  isLoadingDisplay: boolean;
  isLoadingDepartures: boolean;
}): {
  tone: BoardTone;
  headline: string;
  detail: string;
  statusLabel: string;
} {
  if (
    input.isLoadingDisplay ||
    (input.display === null && !input.displayError)
  ) {
    return {
      tone: 'loading',
      headline: 'Loading display',
      detail:
        'Syncing the display configuration before the first board refresh.',
      statusLabel: 'Loading display',
    };
  }

  if (input.displayError) {
    return {
      tone: 'error',
      headline: 'Display unavailable',
      detail: input.displayError,
      statusLabel: 'Display error',
    };
  }

  if (!input.display?.site_id) {
    return {
      tone: 'empty',
      headline: 'No stop configured',
      detail:
        'Select a stop in the config workspace before publishing this board.',
      statusLabel: 'Missing stop',
    };
  }

  if (input.isLoadingDepartures && input.departures.length === 0) {
    return {
      tone: 'loading',
      headline: 'Loading departures',
      detail:
        'Fetching the first live departures for this stop and filter set.',
      statusLabel: 'Loading departures',
    };
  }

  if (input.departuresError && input.departures.length === 0) {
    return {
      tone: 'error',
      headline: 'Live data unavailable',
      detail: input.departuresError,
      statusLabel: 'Departure error',
    };
  }

  if (input.departures.length === 0) {
    return {
      tone: 'empty',
      headline: 'No departures right now',
      detail:
        'The board is live, but nothing matched the current stop and filters.',
      statusLabel: 'Empty board',
    };
  }

  if (input.departuresError) {
    return {
      tone: 'live',
      headline: 'Showing last live board',
      detail: `Latest refresh failed. ${input.departuresError}`,
      statusLabel: 'Stale but visible',
    };
  }

  return {
    tone: 'live',
    headline: 'Live departures',
    detail:
      'The board is running on live data and will continue polling automatically.',
    statusLabel: 'Live',
  };
}

function readErrorMessage(error: unknown, fallback: string) {
  if (error instanceof ConfigApiError) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return fallback;
}

function formatFilterSummary(display: DisplayRecord | null) {
  if (!display) {
    return 'Waiting for config';
  }

  const parts = [];

  parts.push(
    display.line_numbers.length > 0
      ? `${display.line_numbers.length} line${display.line_numbers.length === 1 ? '' : 's'}`
      : 'All lines',
  );
  parts.push(
    display.directions.length > 0
      ? `${display.directions.length} direction${display.directions.length === 1 ? '' : 's'}`
      : 'All directions',
  );

  return parts.join(' / ');
}

function formatTimestamp(value: number) {
  return new Intl.DateTimeFormat('sv-SE', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(value);
}

function StatCard(input: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-[1.5rem] border border-[var(--panel-border)] bg-black/18 p-4">
      <p className="text-xs uppercase tracking-[0.28em] text-[var(--muted-text)]">
        {input.label}
      </p>
      <p className="mt-3 text-lg font-semibold text-[var(--panel-text)]">
        {input.value}
      </p>
      <p className="mt-2 text-sm leading-6 text-[var(--muted-text)]">
        {input.detail}
      </p>
    </div>
  );
}

function DetailRow(input: { label: string; value: string }) {
  return (
    <div className="rounded-[1.2rem] border border-[var(--panel-border)] bg-black/14 px-4 py-3">
      <dt className="text-xs uppercase tracking-[0.24em] text-[var(--muted-text)]">
        {input.label}
      </dt>
      <dd className="mt-2 text-sm leading-6 text-[var(--app-text)]">
        {input.value}
      </dd>
    </div>
  );
}
