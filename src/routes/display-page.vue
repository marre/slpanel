<script setup lang="ts">
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
import { useRoute } from 'vue-router';
import { computed, ref, watch } from 'vue';
import { usePolling } from '@/composables/use-polling';
import type { DepartureRecord, DisplayRecord } from '@/api/types';
import DisplayBoard from '@/components/display-board.vue';
import { getDisplay, listDepartures } from '@/lib/config-api';
const route = useRoute();
const displayId = computed(() =>
  typeof route.params.displayId === 'string' ? route.params.displayId : '',
);
const isDemoBoard = computed(() => displayId.value === 'demo-board');
const display = ref<DisplayRecord | null>(null);
const displayError = ref<string | null>(null);
const isLoadingDisplay = ref(false);
watch(
  displayId,
  (id, _previous, onCleanup) => {
    display.value = null;
    displayError.value = null;
    isLoadingDisplay.value = false;
    if (!id || isDemoBoard.value) return;
    const controller = new AbortController();
    onCleanup(() => controller.abort());
    isLoadingDisplay.value = true;
    getDisplay(id, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) display.value = result;
      })
      .catch((failure) => {
        if (!controller.signal.aborted)
          displayError.value =
            failure instanceof Error
              ? failure.message
              : 'Could not load this display.';
      })
      .finally(() => {
        if (!controller.signal.aborted) isLoadingDisplay.value = false;
      });
  },
  { immediate: true },
);
const activeDisplay = computed(() =>
  isDemoBoard.value ? DEMO_DISPLAY : display.value,
);
const polling = usePolling<DepartureRecord[]>(
  () => activeDisplay.value,
  (signal) => {
    const current = activeDisplay.value;
    return !isDemoBoard.value && current?.site_id
      ? listDepartures(current.site_id, {
          lines: current.line_numbers,
          directions: current.directions,
          modes: current.modes,
          forecast: DEPARTURES_FORECAST_MINUTES,
          signal,
        })
      : null;
  },
  () => activeDisplay.value?.refresh_interval ?? 30,
);
const activeDepartures = computed(() =>
  isDemoBoard.value ? DEMO_DEPARTURES : (polling.data.value ?? []),
);
const activeDisplayError = computed(() =>
  isDemoBoard.value ? null : displayError.value,
);
const activeDeparturesError = computed(() =>
  isDemoBoard.value ? null : polling.error.value,
);
const activeLoadingDisplay = computed(
  () => !isDemoBoard.value && isLoadingDisplay.value,
);
const activeLoadingDepartures = computed(
  () => !isDemoBoard.value && polling.loading.value,
);
const boardState = computed(() =>
  deriveBoardState({
    display: activeDisplay.value,
    departures: activeDepartures.value,
    displayError: activeDisplayError.value,
    departuresError: activeDeparturesError.value,
    isLoadingDisplay: activeLoadingDisplay.value,
    isLoadingDepartures: activeLoadingDepartures.value,
  }),
);
const displayName = computed(
  () =>
    activeDisplay.value?.name ||
    activeDisplay.value?.display_id ||
    'Unknown board',
);
const refreshCopy = computed(() =>
  boardState.value.tone === 'live' && activeDisplay.value?.refresh_interval
    ? `Refreshes every ${activeDisplay.value.refresh_interval} seconds.`
    : boardState.value.tone === 'loading'
      ? 'Syncing now, the board appears with the first refresh.'
      : boardState.value.detail,
);

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
</script>
<template>
  <section class="space-y-6">
    <div class="space-y-3">
      <p class="text-[0.7rem] font-semibold text-[var(--muted-text)]">
        Live board
      </p>
      <div class="flex flex-wrap items-end justify-between gap-4">
        <h1
          class="max-w-4xl text-3xl font-semibold leading-tight text-[var(--app-text)] md:text-5xl"
        >
          {{ displayName }}
        </h1>
        <p
          data-testid="board-status"
          role="status"
          :class="`inline-flex items-center gap-2 rounded border px-3 py-1.5 text-[0.7rem] font-medium uppercase tracking-[0.18em] ${boardState.tone === 'live' ? 'border-emerald-400/40 text-emerald-800' : boardState.tone === 'error' ? 'border-rose-400/40 text-rose-800' : 'border-[var(--panel-border)] text-[var(--muted-text)]'}`"
        >
          <span
            aria-hidden="true"
            :class="`inline-block size-1.5 rounded ${boardState.tone === 'live' ? 'bg-emerald-400' : boardState.tone === 'error' ? 'bg-rose-700' : 'bg-[var(--muted-text)]'}`"
          ></span>
          {{ boardState.statusLabel }}
        </p>
      </div>
    </div>
    <div>
      <DisplayBoard
        :display-name="displayName"
        :site-name="activeDisplay?.site_name ?? null"
        :departures="activeDepartures"
        :tone="boardState.tone"
        :headline="boardState.headline"
        :detail="boardState.detail"
      />
    </div>
    <div
      class="flex flex-col gap-4 border-t border-[var(--panel-border)] pt-5 md:flex-row md:items-center md:justify-between"
    >
      <p
        class="max-w-3xl text-sm leading-7 text-[var(--muted-text)] md:text-base"
      >
        Shows the next departure on the top row and scrolls upcoming departures
        on the second row. {{ refreshCopy }}
      </p>
    </div>
  </section>
</template>
