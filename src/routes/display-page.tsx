import { startTransition, useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';

import type { DepartureRecord, DisplayRecord } from '@/api/types';
import { DisplayBoard } from '@/components/display-board';
import { PicographicsDisplayBoard } from '@/components/picographics-display-board';
import { ConfigApiError, getDisplay, listDepartures } from '@/lib/config-api';
import { pyScriptPicographicsRuntime } from '@/lib/pyscript-picographics-runtime';

const DEPARTURES_FORECAST_MINUTES = 240;

const DEMO_DISPLAY: DisplayRecord = {
  id: 'demo-board',
  owner_id: 'demoOwn1',
  display_id: 'demoBoard123',
  name: 'Demo board preview',
  site_id: '9192',
  site_name: 'Slussen',
  refresh_interval: 45,
  line_numbers: ['17', '18'],
  directions: ['Hagsätra'],
  modes: ['METRO'],
};

const DEMO_DEPARTURES: DepartureRecord[] = [
  {
    line_number: '17',
    destination: 'Hagsätra',
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
    destination: 'Skarpnäck',
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
type DisplayRenderer = 'classic' | 'interstate75';

export function DisplayPage() {
  const { displayId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const isDemoBoard = displayId === 'demo-board';
  const activeRenderer = parseDisplayRenderer(searchParams.get('renderer'));
  const [display, setDisplay] = useState<DisplayRecord | null>(null);
  const [departures, setDepartures] = useState<DepartureRecord[]>([]);
  const [isLoadingDisplay, setIsLoadingDisplay] = useState(!isDemoBoard);
  const [isLoadingDepartures, setIsLoadingDepartures] = useState(false);
  const [displayError, setDisplayError] = useState<string | null>(null);
  const [departuresError, setDeparturesError] = useState<string | null>(null);

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

  const displayName =
    activeDisplay?.name || activeDisplay?.display_id || 'Unknown board';
  const picographicsRuntime = pyScriptPicographicsRuntime;

  function handleRendererChange(renderer: DisplayRenderer) {
    const nextSearchParams = new URLSearchParams(searchParams);

    if (renderer === 'classic') {
      nextSearchParams.delete('renderer');
    } else {
      nextSearchParams.set('renderer', renderer);
    }

    setSearchParams(nextSearchParams, { replace: true });
  }

  const boardElement =
    activeRenderer === 'interstate75' ? (
      <PicographicsDisplayBoard
        displayName={displayName}
        siteName={activeDisplay?.site_name ?? null}
        departures={activeDepartures}
        tone={boardState.tone}
        headline={boardState.headline}
        detail={boardState.detail}
        runtime={picographicsRuntime}
      />
    ) : (
      <DisplayBoard
        displayName={displayName}
        siteName={activeDisplay?.site_name ?? null}
        departures={activeDepartures}
        tone={boardState.tone}
        headline={boardState.headline}
        detail={boardState.detail}
      />
    );

  return (
    <section className="space-y-8">
      <div className="space-y-3">
        <p className="text-xs uppercase tracking-[0.35em] text-[var(--muted-text)]">
          Live board
        </p>
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="space-y-3">
            <h2 className="max-w-4xl text-3xl font-semibold leading-tight text-[var(--panel-text)] md:text-5xl">
              {displayName}
            </h2>
            <p className="max-w-3xl text-sm leading-7 text-[var(--muted-text)] md:text-base">
              Shows the next departure on the top row and scrolls upcoming
              departures on the second row. The board refreshes automatically.
            </p>
          </div>

          <div className="flex flex-wrap gap-3 text-xs uppercase tracking-[0.24em] text-[var(--muted-text)]">
            <div className="inline-flex rounded-full border border-[var(--panel-border)] bg-black/24 p-1">
              {DISPLAY_RENDERER_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={activeRenderer === option.value}
                  onClick={() => handleRendererChange(option.value)}
                  className={`rounded-full px-3 py-2 text-[0.65rem] font-medium uppercase tracking-[0.24em] transition ${
                    activeRenderer === option.value
                      ? 'bg-[var(--panel-text)] text-black'
                      : 'text-[var(--muted-text)] hover:bg-[var(--panel-text)]/10 hover:text-[var(--panel-text)]'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-8 xl:items-start">
        <div className="space-y-5">{boardElement}</div>
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

function parseDisplayRenderer(value: string | null): DisplayRenderer {
  return value === 'interstate75' ? value : 'classic';
}

const DISPLAY_RENDERER_OPTIONS: Array<{
  value: DisplayRenderer;
  label: string;
}> = [
  {
    value: 'classic',
    label: 'Classic board',
  },
  {
    value: 'interstate75',
    label: 'Interstate 75 W preview',
  },
];
