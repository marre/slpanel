import { startTransition, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import CreatableSelect from 'react-select/creatable';
import AsyncSelect from 'react-select/async';
import { components } from 'react-select';
import type { MultiValue, OptionProps, SingleValue } from 'react-select';

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

type DisplayDraft = {
  name: string;
  site_id: string | null;
  site_name: string | null;
  refresh_interval: number;
  line_numbers: string[];
  directions: string[];
  modes: string[];
};

export function ConfigPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeOwnerId = searchParams.get('owner') ?? '';
  const [ownerInput, setOwnerInput] = useState(activeOwnerId);
  const [displays, setDisplays] = useState<DisplayRecord[]>([]);
  const [selectedDisplayId, setSelectedDisplayId] = useState<string>('new');
  const [draft, setDraft] = useState<DisplayDraft>(createEmptyDraft());
  const [departureHints, setDepartureHints] = useState<DepartureRecord[]>([]);
  const [loadingDisplays, setLoadingDisplays] = useState(false);
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
            setDepartureHints([]);
            return;
          }

          setSelectedDisplayId(firstDisplay.id);
          setDraft(createDraftFromDisplay(firstDisplay));
        });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }

        setDisplays([]);
        setSelectedDisplayId('new');
        setDraft(createEmptyDraft());
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
  const selectedLineNumbers = draft.line_numbers;
  const lineOptions = deriveLineOptions(departureHints, draft.modes);
  const directionOptions = deriveDirectionOptions(
    departureHints,
    selectedLineNumbers,
    draft.modes,
  );
  const selectedLineValues: LineOption[] = draft.line_numbers.map(
    (lineNumber) => {
      const existing = lineOptions.find((opt) => opt.value === lineNumber);

      return (
        existing ?? {
          value: lineNumber,
          label: lineNumber,
          transportMode: '',
        }
      );
    },
  );
  const selectedDirectionValues: DirectionOption[] = draft.directions.map(
    (direction) => {
      const existing = directionOptions.find((opt) => opt.value === direction);

      return (
        existing ?? {
          value: direction,
          label: direction,
          lineNumber: '',
          transportMode: '',
        }
      );
    },
  );
  const selectedStopValue: StopOption | null = draft.site_id
    ? {
        value: draft.site_id,
        label: draft.site_name ?? draft.site_id,
        stopAreaName: '',
        type: '',
      }
    : null;
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
      setStatusMessage(null);
      setErrorMessage(null);
    });
  }

  function handleSelectDisplay(display: DisplayRecord) {
    startTransition(() => {
      setSelectedDisplayId(display.id);
      setDraft(createDraftFromDisplay(display));
      setStatusMessage(null);
      setErrorMessage(null);
    });
  }

  function handleLineChange(newValue: MultiValue<LineOption>) {
    setDraft((current) => ({
      ...current,
      line_numbers: newValue.map((opt) => opt.value),
    }));
  }

  function handleDirectionChange(newValue: MultiValue<DirectionOption>) {
    setDraft((current) => ({
      ...current,
      directions: newValue.map((opt) => opt.value),
    }));
  }

  function handleStopChange(newValue: SingleValue<StopOption>) {
    if (newValue) {
      setDraft((current) => ({
        ...current,
        site_id: newValue.value,
        site_name: newValue.label,
      }));
      setDepartureHints([]);
    } else {
      setDraft((current) => ({
        ...current,
        site_id: null,
        site_name: null,
      }));
      setDepartureHints([]);
    }
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
            return;
          }

          setSelectedDisplayId(nextSelectedDisplay.id);
          setDraft(createDraftFromDisplay(nextSelectedDisplay));
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
          Display config
        </p>
        <div className="space-y-3">
          <h2 className="max-w-3xl text-3xl font-semibold leading-tight text-[var(--panel-text)] md:text-4xl">
            Set up and manage your transit display boards.
          </h2>
          <p className="max-w-3xl text-sm leading-7 text-[var(--muted-text)] md:text-base">
            Choose a stop, pick which lines and directions to show, and control
            how often the board refreshes. All changes take effect immediately
            on your display.
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
                Use the stop search to bind one stop, then add optional line and
                direction filters before saving.
              </p>
            </div>
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

              <div className="space-y-2 md:col-span-2">
                <label
                  htmlFor="stop-search"
                  className="text-xs uppercase tracking-[0.28em] text-[var(--muted-text)]"
                >
                  Stop search
                </label>
                <AsyncSelect
                  inputId="stop-search"
                  loadOptions={loadStopOptions}
                  value={selectedStopValue}
                  onChange={handleStopChange}
                  isClearable
                  placeholder="Search stop name…"
                  noOptionsMessage={({ inputValue }) =>
                    inputValue.trim().length < 2
                      ? 'Type at least 2 characters to search.'
                      : 'No stops found.'
                  }
                  loadingMessage={() => 'Searching…'}
                  formatOptionLabel={formatStopOption}
                  components={{ Option: StopOptionComponent }}
                  classNames={selectClassNames}
                  unstyled
                  styles={selectStyles}
                  defaultOptions={false}
                  cacheOptions
                />
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
                <CreatableSelect
                  isMulti
                  isClearable
                  inputId="line-numbers"
                  options={lineOptions}
                  value={selectedLineValues}
                  onChange={handleLineChange}
                  placeholder="Select or type line numbers…"
                  noOptionsMessage={() =>
                    loadingDepartureHints ? 'Loading…' : lineHintEmptyMessage
                  }
                  formatCreateLabel={(input) => `Add "${input}"`}
                  formatOptionLabel={formatLineOption}
                  classNames={selectClassNames}
                  unstyled
                  isDisabled={!draft.site_id}
                  styles={selectStyles}
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <label
                  htmlFor="directions"
                  className="text-xs uppercase tracking-[0.28em] text-[var(--muted-text)]"
                >
                  Direction filters
                </label>
                <CreatableSelect
                  isMulti
                  isClearable
                  inputId="directions"
                  options={directionOptions}
                  value={selectedDirectionValues}
                  onChange={handleDirectionChange}
                  placeholder="Select or type directions…"
                  noOptionsMessage={() =>
                    loadingDepartureHints
                      ? 'Loading…'
                      : draft.site_id
                        ? 'No directions match the current stop and line filters.'
                        : 'Choose a stop to load direction hints.'
                  }
                  formatCreateLabel={(input) => `Add "${input}"`}
                  formatOptionLabel={formatDirectionOption}
                  classNames={selectClassNames}
                  unstyled
                  isDisabled={!draft.site_id}
                  styles={selectStyles}
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

              {selectedDisplay ? (
                <Link
                  to={`/display/${selectedDisplay.id}`}
                  className="ml-auto inline-flex rounded-full border border-[#84d8ff]/50 bg-[#84d8ff]/8 px-5 py-3 text-sm font-medium text-[#b9edff] transition hover:border-[#84d8ff]/80 hover:bg-[#84d8ff]/14"
                >
                  View display
                </Link>
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
    line_numbers: [],
    directions: [],
    modes: [],
  };
}

function createDraftFromDisplay(display: DisplayRecord): DisplayDraft {
  return {
    name: display.name,
    site_id: display.site_id,
    site_name: display.site_name,
    refresh_interval: display.refresh_interval,
    line_numbers: [...display.line_numbers],
    directions: [...display.directions],
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
    line_numbers: [...draft.line_numbers],
    directions: [...draft.directions],
    modes: [...draft.modes],
  };
}

type LineOption = {
  value: string;
  label: string;
  transportMode: string;
};

type DirectionOption = {
  value: string;
  label: string;
  lineNumber: string;
  transportMode: string;
};

function deriveLineOptions(
  departures: DepartureRecord[],
  selectedModes: string[],
): LineOption[] {
  const options = deriveLineOptionsFiltered(departures, selectedModes);

  // Fallback: when mode filter excludes all departures, show all lines
  if (options.length === 0 && selectedModes.length > 0) {
    return deriveLineOptionsFiltered(departures, []);
  }

  return options;
}

function deriveLineOptionsFiltered(
  departures: DepartureRecord[],
  selectedModes: string[],
): LineOption[] {
  const seen = new Map<string, string>();

  for (const d of departures) {
    if (selectedModes.length > 0 && !selectedModes.includes(d.transport_mode)) {
      continue;
    }

    if (!seen.has(d.line_number)) {
      seen.set(d.line_number, d.transport_mode);
    }
  }

  return Array.from(seen.entries())
    .map(([lineNumber, transportMode]) => ({
      value: lineNumber,
      label: lineNumber,
      transportMode,
    }))
    .sort((a, b) =>
      a.value.localeCompare(b.value, undefined, { numeric: true }),
    );
}

function deriveDirectionOptions(
  departures: DepartureRecord[],
  selectedLineNumbers: string[],
  selectedModes: string[],
): DirectionOption[] {
  const seen = new Map<string, { lineNumber: string; transportMode: string }>();

  for (const d of departures) {
    if (selectedModes.length > 0 && !selectedModes.includes(d.transport_mode)) {
      continue;
    }

    if (
      selectedLineNumbers.length > 0 &&
      !selectedLineNumbers.includes(d.line_number)
    ) {
      continue;
    }

    if (!seen.has(d.destination)) {
      seen.set(d.destination, {
        lineNumber: d.line_number,
        transportMode: d.transport_mode,
      });
    }
  }

  return Array.from(seen.entries())
    .map(([destination, info]) => ({
      value: destination,
      label: destination,
      lineNumber: info.lineNumber,
      transportMode: info.transportMode,
    }))
    .sort((a, b) => a.value.localeCompare(b.value, 'sv'));
}

function formatLineOption(
  option: LineOption,
  meta: { context: 'value' | 'menu' },
) {
  if (meta.context === 'value') {
    return option.label;
  }

  return (
    <span className="flex items-center gap-2">
      <span>{option.label}</span>
      <span className="rounded-full border border-current/20 px-1.5 py-0.5 text-[11px] uppercase tracking-[0.12em] opacity-70">
        {option.transportMode}
      </span>
    </span>
  );
}

function formatDirectionOption(
  option: DirectionOption,
  meta: { context: 'value' | 'menu' },
) {
  if (meta.context === 'value') {
    return option.label;
  }

  return (
    <span className="flex flex-col gap-0.5">
      <span>{option.label}</span>
      <span className="flex items-center gap-1.5 text-xs opacity-65">
        <span>Line {option.lineNumber}</span>
        <span className="rounded-full border border-current/20 px-1.5 py-0.5 text-[10px] uppercase tracking-[0.12em]">
          {option.transportMode}
        </span>
      </span>
    </span>
  );
}

const selectClassNames = {
  control: (state: { isFocused: boolean }) =>
    [
      'rounded-[1rem] border bg-black/30 px-2 py-2 text-sm transition min-h-0 cursor-text',
      state.isFocused
        ? 'border-[var(--panel-text)]'
        : 'border-[var(--panel-border)]',
    ].join(' '),
  valueContainer: () => 'flex flex-wrap gap-1',
  multiValue: () =>
    'rounded-full border border-[var(--panel-border)] bg-[var(--panel-text)]/10',
  multiValueLabel: () => 'text-xs text-[var(--panel-text)] px-2 py-0.5',
  multiValueRemove: () =>
    'text-[var(--muted-text)] hover:text-red-400 hover:bg-red-400/10 rounded-r-full px-1 transition',
  input: () => 'text-sm text-[var(--app-text)]',
  placeholder: () => 'text-sm text-[var(--muted-text)]/60',
  menu: () =>
    'mt-2 rounded-[1.25rem] border border-[var(--panel-border)] bg-black/95 backdrop-blur-md shadow-xl shadow-black/40 overflow-hidden z-50',
  menuList: () => 'p-2 max-h-64 overflow-auto',
  option: (state: { isFocused: boolean; isSelected: boolean }) =>
    [
      'rounded-[0.75rem] px-3 py-2.5 text-sm cursor-pointer transition',
      state.isSelected
        ? 'bg-[var(--panel-text)]/15 text-[var(--panel-text)]'
        : state.isFocused
          ? 'bg-[var(--panel-text)]/8 text-[var(--panel-text)]'
          : 'text-[var(--app-text)]',
    ].join(' '),
  noOptionsMessage: () => 'text-xs text-[var(--muted-text)] px-3 py-4',
  loadingMessage: () => 'text-xs text-[var(--muted-text)] px-3 py-4',
  indicatorsContainer: () => '',
  indicatorSeparator: () => 'hidden',
  dropdownIndicator: () =>
    'text-[var(--muted-text)] hover:text-[var(--panel-text)] px-1 transition',
  clearIndicator: () =>
    'text-[var(--muted-text)] hover:text-red-400 px-1 transition',
};

const selectStyles = {
  multiValueRemove: (base: Record<string, unknown>) => ({
    ...base,
    ':hover': {},
  }),
};

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

type StopOption = {
  value: string;
  label: string;
  stopAreaName: string;
  type: string;
};

async function loadStopOptions(inputValue: string): Promise<StopOption[]> {
  const trimmed = inputValue.trim();

  if (trimmed.length < 2) {
    return [];
  }

  try {
    const results = await searchStops(trimmed);

    return results.map((site) => ({
      value: site.site_id,
      label: site.name,
      stopAreaName: site.stop_area_name,
      type: site.type,
    }));
  } catch {
    return [];
  }
}

function StopOptionComponent(props: OptionProps<StopOption, false>) {
  const typeLabel = mapStopType(props.data.type);

  return (
    <components.Option {...props}>
      <span className="flex items-center justify-between gap-3 w-full">
        <span className="flex flex-col gap-0.5 min-w-0">
          <span className="truncate">{props.data.label}</span>
          <span className="text-xs text-[var(--muted-text)] truncate">
            {props.data.stopAreaName}
          </span>
        </span>
        {typeLabel ? (
          <span className="shrink-0 rounded-full border border-[var(--panel-text)]/30 px-1.5 py-0.5 text-[11px] uppercase tracking-[0.1em] text-[var(--panel-text)]/75">
            {typeLabel}
          </span>
        ) : null}
      </span>
    </components.Option>
  );
}

function formatStopOption(
  option: StopOption,
  meta: { context: 'value' | 'menu' },
) {
  const typeLabel = mapStopType(option.type);
  const badge = typeLabel ? (
    <span className="rounded-full border border-current/30 px-1.5 py-0.5 text-[11px] uppercase tracking-[0.1em] text-[var(--panel-text)]/80">
      {typeLabel}
    </span>
  ) : null;

  if (meta.context === 'value') {
    return (
      <span className="flex items-center gap-2">
        <span>{option.label}</span>
        {badge}
      </span>
    );
  }

  return (
    <span className="flex items-center justify-between gap-3 w-full">
      <span className="flex flex-col gap-0.5 min-w-0">
        <span className="truncate">{option.label}</span>
        <span className="text-xs text-[var(--muted-text)] truncate">
          {option.stopAreaName}
        </span>
      </span>
      {badge}
    </span>
  );
}

function mapStopType(type: string): string {
  const upper = (type ?? '').toUpperCase();

  switch (upper) {
    case 'METROSTN':
      return 'Metro';
    case 'BUSSTERM':
      return 'Bus';
    case 'TRAMSTN':
      return 'Tram';
    case 'RAILWSTN':
    case 'RAILSTN':
      return 'Train';
    case 'FERRYBER':
      return 'Ferry';
    case 'STOP':
    case '':
      return '';
    default:
      return upper;
  }
}
