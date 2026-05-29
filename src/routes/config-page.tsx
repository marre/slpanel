import { startTransition, useDeferredValue, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import type {
  CreateDisplayInput,
  DepartureRecord,
  DisplayRecord,
  UpdateDisplayInput,
} from '@/api/types';
import {
  ConfigApiError,
  createDisplay,
  deleteDisplay,
  listDepartures,
  listDisplays,
  searchStops,
  updateDisplay,
} from '@/lib/config-api';

const OWNER_ID_PATTERN = /^[A-Za-z0-9]{8}$/;
const OWNER_STORAGE_KEY = 'slpanel.owner-id';
const TRANSPORT_MODE_OPTIONS = ['METRO', 'BUS', 'TRAM', 'TRAIN', 'FERRY'];

type DisplayDraft = {
  name: string;
  site_id: string | null;
  site_name: string | null;
  refresh_interval: number;
  line_numbers_text: string;
  directions_text: string;
  modes: string[];
};

export function ConfigPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeOwnerId = searchParams.get('owner') ?? '';
  const [ownerInput, setOwnerInput] = useState(activeOwnerId);
  const [displays, setDisplays] = useState<DisplayRecord[]>([]);
  const [selectedDisplayId, setSelectedDisplayId] = useState<string>('new');
  const [draft, setDraft] = useState<DisplayDraft>(createEmptyDraft());
  const [stopQuery, setStopQuery] = useState('');
  const deferredStopQuery = useDeferredValue(stopQuery);
  const [stopResults, setStopResults] = useState<
    Array<{
      site_id: string;
      name: string;
      stop_area_name: string;
      type: string;
    }>
  >([]);
  const [departureHints, setDepartureHints] = useState<DepartureRecord[]>([]);
  const [loadingDisplays, setLoadingDisplays] = useState(false);
  const [searchingStops, setSearchingStops] = useState(false);
  const [loadingDepartureHints, setLoadingDepartureHints] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    startTransition(() => {
      setOwnerInput(activeOwnerId);
    });

    if (typeof window === 'undefined') {
      return;
    }

    if (activeOwnerId) {
      window.localStorage.setItem(OWNER_STORAGE_KEY, activeOwnerId);
      return;
    }

    const storedOwnerId = window.localStorage.getItem(OWNER_STORAGE_KEY);

    if (!storedOwnerId || !OWNER_ID_PATTERN.test(storedOwnerId)) {
      return;
    }

    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('owner', storedOwnerId);
    setSearchParams(nextParams, { replace: true });
  }, [activeOwnerId, searchParams, setSearchParams]);

  useEffect(() => {
    if (!activeOwnerId) {
      startTransition(() => {
        setDisplays([]);
        setSelectedDisplayId('new');
        setDraft(createEmptyDraft());
        setStopQuery('');
        setStopResults([]);
        setDepartureHints([]);
        setLoadingDisplays(false);
      });

      return;
    }

    const controller = new AbortController();

    startTransition(() => {
      setLoadingDisplays(true);
      setErrorMessage(null);
    });

    listDisplays(activeOwnerId, controller.signal)
      .then((nextDisplays) => {
        if (controller.signal.aborted) {
          return;
        }

        setDisplays(nextDisplays);

        startTransition(() => {
          const firstDisplay = nextDisplays[0];

          if (!firstDisplay) {
            setSelectedDisplayId('new');
            setDraft(createEmptyDraft());
            setStopQuery('');
            setDepartureHints([]);
            return;
          }

          setSelectedDisplayId(firstDisplay.id);
          setDraft(createDraftFromDisplay(firstDisplay));
          setStopQuery(firstDisplay.site_name ?? '');
        });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }

        setDisplays([]);
        setSelectedDisplayId('new');
        setDraft(createEmptyDraft());
        setStopQuery('');
        setDepartureHints([]);
        setErrorMessage(readErrorMessage(error));
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoadingDisplays(false);
        }
      });

    return () => {
      controller.abort();
    };
  }, [activeOwnerId]);

  useEffect(() => {
    const normalizedQuery = deferredStopQuery.trim();

    if (
      normalizedQuery.length < 2 ||
      normalizeValue(normalizedQuery) === normalizeValue(draft.site_name ?? '')
    ) {
      startTransition(() => {
        setStopResults([]);
        setSearchingStops(false);
      });

      return;
    }

    const controller = new AbortController();

    startTransition(() => {
      setSearchingStops(true);
    });

    searchStops(normalizedQuery, controller.signal)
      .then((results) => {
        if (!controller.signal.aborted) {
          setStopResults(results);
        }
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }

        setErrorMessage(readErrorMessage(error));
        setStopResults([]);
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setSearchingStops(false);
        }
      });

    return () => {
      controller.abort();
    };
  }, [deferredStopQuery, draft.site_name]);

  useEffect(() => {
    if (!draft.site_id) {
      startTransition(() => {
        setDepartureHints([]);
        setLoadingDepartureHints(false);
      });

      return;
    }

    const controller = new AbortController();

    startTransition(() => {
      setLoadingDepartureHints(true);
    });

    listDepartures(draft.site_id, {
      forecast: 240,
      signal: controller.signal,
    })
      .then((departures) => {
        if (!controller.signal.aborted) {
          setDepartureHints(departures);
        }
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }

        setDepartureHints([]);
        setErrorMessage(readErrorMessage(error));
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoadingDepartureHints(false);
        }
      });

    return () => {
      controller.abort();
    };
  }, [draft.site_id]);

  const selectedDisplay =
    displays.find((display) => display.id === selectedDisplayId) ?? null;
  const isCreating = selectedDisplayId === 'new';
  const selectedLineNumbers = splitList(draft.line_numbers_text);
  const unfilteredLineHints = deriveLineHints(departureHints, []);
  const filteredLineHints = deriveLineHints(departureHints, draft.modes);
  const usingLineHintFallback =
    draft.modes.length > 0 &&
    filteredLineHints.length === 0 &&
    unfilteredLineHints.length > 0;
  const lineHints = usingLineHintFallback
    ? unfilteredLineHints
    : filteredLineHints;
  const directionHints = deriveDirectionHints(
    departureHints,
    selectedLineNumbers,
    draft.modes,
  );
  const lineHintDescription = usingLineHintFallback
    ? 'No live lines match the current transport-mode filter, so all lines for the selected stop are shown.'
    : 'Live departures for the selected stop.';
  const lineHintEmptyMessage = draft.site_id
    ? 'No live line hints for this stop yet.'
    : 'Choose a stop to load line hints.';

  async function handleOwnerSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const normalizedOwnerId = ownerInput.trim();

    if (!OWNER_ID_PATTERN.test(normalizedOwnerId)) {
      setErrorMessage('Owner ID must be 8 alphanumeric characters.');
      return;
    }

    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('owner', normalizedOwnerId);
    setSearchParams(nextParams);
    setStatusMessage(null);
    setErrorMessage(null);
  }

  function handleStartNewDisplay() {
    startTransition(() => {
      setSelectedDisplayId('new');
      setDraft(createEmptyDraft());
      setStopQuery('');
      setStopResults([]);
      setStatusMessage(null);
      setErrorMessage(null);
    });
  }

  function handleSelectDisplay(display: DisplayRecord) {
    startTransition(() => {
      setSelectedDisplayId(display.id);
      setDraft(createDraftFromDisplay(display));
      setStopQuery(display.site_name ?? '');
      setStopResults([]);
      setStatusMessage(null);
      setErrorMessage(null);
    });
  }

  function handleModeToggle(mode: string) {
    setDraft((current) => ({
      ...current,
      modes: current.modes.includes(mode)
        ? current.modes.filter((value) => value !== mode)
        : [...current.modes, mode],
    }));
  }

  function handleLineHintToggle(lineNumber: string) {
    setDraft((current) => ({
      ...current,
      line_numbers_text: toggleDelimitedValue(
        current.line_numbers_text,
        lineNumber,
      ),
    }));
  }

  function handleDirectionHintToggle(direction: string) {
    setDraft((current) => ({
      ...current,
      directions_text: toggleDelimitedValue(current.directions_text, direction),
    }));
  }

  function handleStopSelection(site: {
    site_id: string;
    name: string;
    stop_area_name: string;
  }) {
    setDraft((current) => ({
      ...current,
      site_id: site.site_id,
      site_name: site.name,
    }));
    setStopQuery(site.name);
    setStopResults([]);
    setDepartureHints([]);
  }

  function handleClearStop() {
    setDraft((current) => ({
      ...current,
      site_id: null,
      site_name: null,
    }));
    setStopQuery('');
    setStopResults([]);
    setDepartureHints([]);
  }

  async function handleSaveDisplay(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!activeOwnerId) {
      setErrorMessage('Enter an owner ID before saving displays.');
      return;
    }

    if (!draft.name.trim()) {
      setErrorMessage('Display name is required.');
      return;
    }

    if (
      !Number.isInteger(draft.refresh_interval) ||
      draft.refresh_interval <= 0
    ) {
      setErrorMessage('Refresh interval must be a positive integer.');
      return;
    }

    setSaving(true);
    setStatusMessage(null);
    setErrorMessage(null);

    try {
      const savedDisplay = isCreating
        ? await createDisplay(buildCreatePayload(activeOwnerId, draft))
        : await updateDisplay(selectedDisplayId, buildUpdatePayload(draft));

      setDisplays((current) => {
        if (isCreating) {
          return [savedDisplay, ...current];
        }

        return current.map((display) =>
          display.id === savedDisplay.id ? savedDisplay : display,
        );
      });
      setSelectedDisplayId(savedDisplay.id);
      setDraft(createDraftFromDisplay(savedDisplay));
      setStopQuery(savedDisplay.site_name ?? '');
      setStopResults([]);
      setStatusMessage(isCreating ? 'Display created.' : 'Display updated.');
    } catch (error) {
      setErrorMessage(readErrorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteDisplay() {
    if (!selectedDisplay) {
      return;
    }

    setDeleting(true);
    setStatusMessage(null);
    setErrorMessage(null);

    try {
      await deleteDisplay(selectedDisplay.id);

      setDisplays((current) => {
        const nextDisplays = current.filter(
          (display) => display.id !== selectedDisplay.id,
        );
        const nextSelectedDisplay = nextDisplays[0] ?? null;

        startTransition(() => {
          if (!nextSelectedDisplay) {
            setSelectedDisplayId('new');
            setDraft(createEmptyDraft());
            setStopQuery('');
            return;
          }

          setSelectedDisplayId(nextSelectedDisplay.id);
          setDraft(createDraftFromDisplay(nextSelectedDisplay));
          setStopQuery(nextSelectedDisplay.site_name ?? '');
        });

        return nextDisplays;
      });

      setStatusMessage('Display deleted.');
    } catch (error) {
      setErrorMessage(readErrorMessage(error));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <section className="space-y-8">
      <div className="space-y-3">
        <p className="text-xs uppercase tracking-[0.35em] text-[var(--muted-text)]">
          Phase 4 config workspace
        </p>
        <div className="space-y-3">
          <h2 className="max-w-3xl text-3xl font-semibold leading-tight text-[var(--panel-text)] md:text-4xl">
            Manage owners, stops, and display filters from one admin screen.
          </h2>
          <p className="max-w-3xl text-sm leading-7 text-[var(--muted-text)] md:text-base">
            This first Phase 4 slice wires the config route to the Worker API:
            owner lookup, display CRUD, stop search, and line, direction, and
            mode filters all run against the live backend contract.
          </p>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(21rem,24rem)_minmax(0,1fr)] xl:items-start">
        <aside className="space-y-5 rounded-[2rem] border border-[var(--panel-border)] bg-black/15 p-5">
          <form className="space-y-4" onSubmit={handleOwnerSubmit}>
            <div className="space-y-2">
              <label
                htmlFor="owner-id"
                className="text-xs uppercase tracking-[0.3em] text-[var(--muted-text)]"
              >
                Owner ID
              </label>
              <input
                id="owner-id"
                value={ownerInput}
                onChange={(event) => setOwnerInput(event.target.value)}
                placeholder="aB3xZ9kQ"
                className="w-full rounded-[1rem] border border-[var(--panel-border)] bg-black/30 px-4 py-3 text-sm text-[var(--app-text)] outline-none transition placeholder:text-[var(--muted-text)]/60 focus:border-[var(--panel-text)]"
              />
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="submit"
                className="rounded-full border border-[var(--panel-text)] bg-[var(--panel-text)] px-4 py-2 text-sm font-medium text-black transition hover:bg-[var(--panel-text-soft)]"
              >
                Load displays
              </button>

              {activeOwnerId ? (
                <button
                  type="button"
                  onClick={() => {
                    setSearchParams({});
                    setStatusMessage(null);
                    setErrorMessage(null);
                  }}
                  className="rounded-full border border-[var(--panel-border)] px-4 py-2 text-sm text-[var(--muted-text)] transition hover:border-[var(--panel-text)]/50 hover:text-[var(--panel-text)]"
                >
                  Clear owner
                </button>
              ) : null}
            </div>
          </form>

          <div className="rounded-[1.5rem] border border-[var(--panel-border)] bg-black/20 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <p className="text-xs uppercase tracking-[0.28em] text-[var(--muted-text)]">
                  Display inventory
                </p>
                <h3 className="text-lg font-semibold text-[var(--panel-text)]">
                  {activeOwnerId ? `Owner ${activeOwnerId}` : 'Choose an owner'}
                </h3>
              </div>

              <button
                type="button"
                onClick={handleStartNewDisplay}
                disabled={!activeOwnerId}
                className="rounded-full border border-[var(--panel-border)] px-3 py-2 text-xs font-medium uppercase tracking-[0.2em] text-[var(--panel-text)] transition hover:border-[var(--panel-text)]/70 hover:bg-[var(--panel-text)]/8 disabled:cursor-not-allowed disabled:opacity-45"
              >
                New display
              </button>
            </div>

            <div className="mt-4 space-y-3">
              {loadingDisplays ? (
                <p className="text-sm text-[var(--muted-text)]">
                  Loading displays…
                </p>
              ) : displays.length > 0 ? (
                displays.map((display) => {
                  const isSelected = display.id === selectedDisplayId;

                  return (
                    <button
                      key={display.id}
                      type="button"
                      onClick={() => handleSelectDisplay(display)}
                      className={[
                        'flex w-full flex-col gap-2 rounded-[1.25rem] border px-4 py-4 text-left transition',
                        isSelected
                          ? 'border-[var(--panel-text)] bg-[var(--panel-text)]/10 text-[var(--panel-text)]'
                          : 'border-[var(--panel-border)] bg-black/10 text-[var(--app-text)] hover:border-[var(--panel-text)]/55',
                      ].join(' ')}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-medium">
                            {display.name || `Display ${display.display_id}`}
                          </p>
                          <p className="mt-1 text-xs text-[var(--muted-text)]">
                            {display.site_name ?? 'No stop selected'}
                          </p>
                        </div>

                        <span className="rounded-full border border-current/20 px-2 py-1 text-[11px] uppercase tracking-[0.16em]">
                          {display.refresh_interval}s
                        </span>
                      </div>

                      <p className="text-xs text-[var(--muted-text)]">
                        {describeFilters(display)}
                      </p>
                    </button>
                  );
                })
              ) : activeOwnerId ? (
                <div className="rounded-[1.25rem] border border-dashed border-[var(--panel-border)] px-4 py-6 text-sm text-[var(--muted-text)]">
                  No displays yet. Create the first board for this owner.
                </div>
              ) : (
                <p className="text-sm text-[var(--muted-text)]">
                  Enter an owner ID to load or create displays.
                </p>
              )}
            </div>
          </div>
        </aside>

        <div className="space-y-5 rounded-[2rem] border border-[var(--panel-border)] bg-black/15 p-5 md:p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted-text)]">
                {isCreating ? 'New display' : 'Edit display'}
              </p>
              <h3 className="text-2xl font-semibold text-[var(--panel-text)]">
                {isCreating
                  ? 'Create a new board configuration'
                  : draft.name || selectedDisplay?.display_id || 'Edit display'}
              </h3>
              <p className="max-w-2xl text-sm leading-6 text-[var(--muted-text)]">
                Use the stop search to bind one stop, then add optional line,
                direction, and transport-mode filters before saving.
              </p>
            </div>

            {selectedDisplay ? (
              <Link
                to={`/display/${selectedDisplay.id}`}
                className="inline-flex rounded-full border border-[var(--panel-border)] px-4 py-2 text-sm font-medium text-[var(--panel-text)] transition hover:border-[var(--panel-text)]/60 hover:bg-[var(--panel-text)]/8"
              >
                Open display URL
              </Link>
            ) : null}
          </div>

          {statusMessage ? (
            <div className="rounded-[1.25rem] border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
              {statusMessage}
            </div>
          ) : null}

          {errorMessage ? (
            <div className="rounded-[1.25rem] border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
              {errorMessage}
            </div>
          ) : null}

          <form className="space-y-6" onSubmit={handleSaveDisplay}>
            <div className="grid gap-5 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
                <label
                  htmlFor="display-name"
                  className="text-xs uppercase tracking-[0.28em] text-[var(--muted-text)]"
                >
                  Display name
                </label>
                <input
                  id="display-name"
                  value={draft.name}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                  placeholder="Southbound platform"
                  className="w-full rounded-[1rem] border border-[var(--panel-border)] bg-black/30 px-4 py-3 text-sm text-[var(--app-text)] outline-none transition placeholder:text-[var(--muted-text)]/60 focus:border-[var(--panel-text)]"
                />
              </div>

              <div className="space-y-3 md:col-span-2">
                <div className="space-y-1">
                  <p className="text-xs uppercase tracking-[0.28em] text-[var(--muted-text)]">
                    Transport modes
                  </p>
                  <p className="text-xs leading-5 text-[var(--muted-text)]/90">
                    Select modes first if you want the line and direction hints
                    below to narrow down automatically.
                  </p>
                </div>
                <div className="flex flex-wrap gap-3">
                  {TRANSPORT_MODE_OPTIONS.map((mode) => {
                    const isSelected = draft.modes.includes(mode);

                    return (
                      <label
                        key={mode}
                        className={[
                          'inline-flex cursor-pointer items-center gap-2 rounded-full border px-4 py-2 text-sm transition',
                          isSelected
                            ? 'border-[var(--panel-text)] bg-[var(--panel-text)]/12 text-[var(--panel-text)]'
                            : 'border-[var(--panel-border)] text-[var(--muted-text)] hover:border-[var(--panel-text)]/55 hover:text-[var(--panel-text)]',
                        ].join(' ')}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleModeToggle(mode)}
                          className="sr-only"
                        />
                        <span>{mode}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2 md:col-span-2">
                <label
                  htmlFor="stop-search"
                  className="text-xs uppercase tracking-[0.28em] text-[var(--muted-text)]"
                >
                  Stop search
                </label>
                <div className="flex flex-col gap-3">
                  <div className="flex flex-col gap-3 md:flex-row">
                    <input
                      id="stop-search"
                      value={stopQuery}
                      onChange={(event) => setStopQuery(event.target.value)}
                      placeholder="Search stop name"
                      className="w-full rounded-[1rem] border border-[var(--panel-border)] bg-black/30 px-4 py-3 text-sm text-[var(--app-text)] outline-none transition placeholder:text-[var(--muted-text)]/60 focus:border-[var(--panel-text)]"
                    />

                    {draft.site_id ? (
                      <button
                        type="button"
                        onClick={handleClearStop}
                        className="rounded-full border border-[var(--panel-border)] px-4 py-2 text-sm text-[var(--muted-text)] transition hover:border-[var(--panel-text)]/50 hover:text-[var(--panel-text)]"
                      >
                        Clear stop
                      </button>
                    ) : null}
                  </div>

                  <div className="rounded-[1rem] border border-[var(--panel-border)] bg-black/20 px-4 py-3 text-sm text-[var(--muted-text)]">
                    {draft.site_id ? (
                      <span>
                        Selected stop:{' '}
                        <strong className="text-[var(--app-text)]">
                          {draft.site_name}
                        </strong>{' '}
                        <span className="text-[var(--muted-text)]/80">
                          ({draft.site_id})
                        </span>
                      </span>
                    ) : (
                      <span>No stop selected yet.</span>
                    )}
                  </div>

                  {searchingStops ? (
                    <p className="text-xs uppercase tracking-[0.22em] text-[var(--muted-text)]">
                      Searching stops…
                    </p>
                  ) : null}

                  {stopResults.length > 0 ? (
                    <div className="max-h-64 overflow-auto rounded-[1.25rem] border border-[var(--panel-border)] bg-black/20 p-2">
                      {stopResults.map((site) => (
                        <button
                          key={site.site_id}
                          type="button"
                          onClick={() => handleStopSelection(site)}
                          className="flex w-full flex-col gap-1 rounded-[1rem] px-4 py-3 text-left transition hover:bg-[var(--panel-text)]/10"
                        >
                          <span className="font-medium text-[var(--app-text)]">
                            {site.name}
                          </span>
                          <span className="text-xs text-[var(--muted-text)]">
                            {site.stop_area_name} · {site.type} · {site.site_id}
                          </span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="space-y-2">
                <label
                  htmlFor="refresh-interval"
                  className="text-xs uppercase tracking-[0.28em] text-[var(--muted-text)]"
                >
                  Refresh interval (seconds)
                </label>
                <input
                  id="refresh-interval"
                  type="number"
                  min={1}
                  step={1}
                  value={draft.refresh_interval}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      refresh_interval: Math.max(
                        1,
                        Number(event.target.value) || 1,
                      ),
                    }))
                  }
                  className="w-full rounded-[1rem] border border-[var(--panel-border)] bg-black/30 px-4 py-3 text-sm text-[var(--app-text)] outline-none transition focus:border-[var(--panel-text)]"
                />
              </div>

              <div className="space-y-2">
                <label
                  htmlFor="line-numbers"
                  className="text-xs uppercase tracking-[0.28em] text-[var(--muted-text)]"
                >
                  Line numbers
                </label>
                <input
                  id="line-numbers"
                  value={draft.line_numbers_text}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      line_numbers_text: event.target.value,
                    }))
                  }
                  placeholder="17, 18"
                  className="w-full rounded-[1rem] border border-[var(--panel-border)] bg-black/30 px-4 py-3 text-sm text-[var(--app-text)] outline-none transition placeholder:text-[var(--muted-text)]/60 focus:border-[var(--panel-text)]"
                />

                <HintGroup
                  title="Line hints"
                  description={lineHintDescription}
                  values={lineHints}
                  selectedValues={selectedLineNumbers}
                  loading={loadingDepartureHints}
                  emptyMessage={lineHintEmptyMessage}
                  onToggle={handleLineHintToggle}
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <label
                  htmlFor="directions"
                  className="text-xs uppercase tracking-[0.28em] text-[var(--muted-text)]"
                >
                  Direction filters
                </label>
                <input
                  id="directions"
                  value={draft.directions_text}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      directions_text: event.target.value,
                    }))
                  }
                  placeholder="Hagsätra, 2"
                  className="w-full rounded-[1rem] border border-[var(--panel-border)] bg-black/30 px-4 py-3 text-sm text-[var(--app-text)] outline-none transition placeholder:text-[var(--muted-text)]/60 focus:border-[var(--panel-text)]"
                />

                <HintGroup
                  title="Direction hints"
                  description="Derived from upcoming destinations at the selected stop."
                  values={directionHints}
                  selectedValues={splitList(draft.directions_text)}
                  loading={loadingDepartureHints}
                  emptyMessage={
                    draft.site_id
                      ? 'No live direction hints match the current stop and line filters.'
                      : 'Choose a stop to load direction hints.'
                  }
                  onToggle={handleDirectionHintToggle}
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-3 border-t border-[var(--panel-border)] pt-5">
              <button
                type="submit"
                disabled={!activeOwnerId || saving}
                className="rounded-full border border-[var(--panel-text)] bg-[var(--panel-text)] px-5 py-3 text-sm font-medium text-black transition hover:bg-[var(--panel-text-soft)] disabled:cursor-not-allowed disabled:opacity-45"
              >
                {saving
                  ? isCreating
                    ? 'Creating…'
                    : 'Saving…'
                  : isCreating
                    ? 'Create display'
                    : 'Save changes'}
              </button>

              {!isCreating ? (
                <button
                  type="button"
                  onClick={handleDeleteDisplay}
                  disabled={deleting}
                  className="rounded-full border border-rose-400/40 px-5 py-3 text-sm font-medium text-rose-100 transition hover:bg-rose-500/10 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  {deleting ? 'Deleting…' : 'Delete display'}
                </button>
              ) : null}
            </div>
          </form>
        </div>
      </div>
    </section>
  );
}

function createEmptyDraft(): DisplayDraft {
  return {
    name: '',
    site_id: null,
    site_name: null,
    refresh_interval: 30,
    line_numbers_text: '',
    directions_text: '',
    modes: [],
  };
}

function createDraftFromDisplay(display: DisplayRecord): DisplayDraft {
  return {
    name: display.name,
    site_id: display.site_id,
    site_name: display.site_name,
    refresh_interval: display.refresh_interval,
    line_numbers_text: display.line_numbers.join(', '),
    directions_text: display.directions.join(', '),
    modes: [...display.modes],
  };
}

function buildCreatePayload(
  ownerId: string,
  draft: DisplayDraft,
): CreateDisplayInput {
  return {
    owner_id: ownerId,
    ...buildCommonPayload(draft),
  };
}

function buildUpdatePayload(draft: DisplayDraft): UpdateDisplayInput {
  return buildCommonPayload(draft);
}

function buildCommonPayload(draft: DisplayDraft) {
  return {
    name: draft.name.trim(),
    site_id: draft.site_id,
    site_name: draft.site_name,
    refresh_interval: draft.refresh_interval,
    line_numbers: splitList(draft.line_numbers_text),
    directions: splitList(draft.directions_text),
    modes: [...draft.modes],
  };
}

function splitList(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );
}

function toggleDelimitedValue(source: string, value: string): string {
  const values = splitList(source);

  if (values.includes(value)) {
    return values.filter((entry) => entry !== value).join(', ');
  }

  return [...values, value].join(', ');
}

function deriveLineHints(
  departures: DepartureRecord[],
  selectedModes: string[],
): string[] {
  return Array.from(
    new Set(
      departures
        .filter(
          (departure) =>
            selectedModes.length === 0 ||
            selectedModes.includes(departure.transport_mode),
        )
        .map((departure) => departure.line_number)
        .filter(Boolean),
    ),
  ).sort((left, right) =>
    left.localeCompare(right, undefined, { numeric: true }),
  );
}

function deriveDirectionHints(
  departures: DepartureRecord[],
  selectedLineNumbers: string[],
  selectedModes: string[],
): string[] {
  return Array.from(
    new Set(
      departures
        .filter(
          (departure) =>
            (selectedModes.length === 0 ||
              selectedModes.includes(departure.transport_mode)) &&
            (selectedLineNumbers.length === 0 ||
              selectedLineNumbers.includes(departure.line_number)),
        )
        .map((departure) => departure.destination)
        .filter(Boolean),
    ),
  ).sort((left, right) => left.localeCompare(right, 'sv'));
}

function describeFilters(display: DisplayRecord): string {
  const parts = [
    display.line_numbers.length > 0
      ? `Lines ${display.line_numbers.join(', ')}`
      : 'All lines',
    display.directions.length > 0
      ? `Directions ${display.directions.join(', ')}`
      : 'All directions',
    display.modes.length > 0
      ? `Modes ${display.modes.join(', ')}`
      : 'All modes',
  ];

  return parts.join(' · ');
}

function readErrorMessage(error: unknown): string {
  if (error instanceof ConfigApiError) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'Something went wrong.';
}

function normalizeValue(value: string): string {
  return value.trim().toLowerCase();
}

type HintGroupProps = {
  title: string;
  description: string;
  values: string[];
  selectedValues: string[];
  loading: boolean;
  emptyMessage: string;
  onToggle: (value: string) => void;
};

function HintGroup({
  title,
  description,
  values,
  selectedValues,
  loading,
  emptyMessage,
  onToggle,
}: HintGroupProps) {
  return (
    <div className="space-y-2 rounded-[1rem] border border-[var(--panel-border)] bg-black/20 px-4 py-3">
      <div className="space-y-1">
        <p className="text-[11px] uppercase tracking-[0.24em] text-[var(--muted-text)]">
          {title}
        </p>
        <p className="text-xs leading-5 text-[var(--muted-text)]/90">
          {description}
        </p>
      </div>

      {loading ? (
        <p className="text-xs uppercase tracking-[0.22em] text-[var(--muted-text)]">
          Loading hints…
        </p>
      ) : values.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {values.map((value) => {
            const isSelected = selectedValues.includes(value);

            return (
              <button
                key={value}
                type="button"
                aria-pressed={isSelected}
                onClick={() => onToggle(value)}
                className={[
                  'rounded-full border px-3 py-2 text-xs font-medium transition',
                  isSelected
                    ? 'border-[var(--panel-text)] bg-[var(--panel-text)]/12 text-[var(--panel-text)]'
                    : 'border-[var(--panel-border)] text-[var(--muted-text)] hover:border-[var(--panel-text)]/60 hover:text-[var(--panel-text)]',
                ].join(' ')}
              >
                {value}
              </button>
            );
          })}
        </div>
      ) : (
        <p className="text-xs leading-5 text-[var(--muted-text)]/85">
          {emptyMessage}
        </p>
      )}
    </div>
  );
}
