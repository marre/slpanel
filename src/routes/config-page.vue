<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import DisplayBoard from '@/components/display-board.vue';
import StopPicker from '@/components/stop-picker.vue';
import FilterPicker from '@/components/filter-picker.vue';
import { usePolling } from '@/composables/use-polling';
import type {
  CreateDisplayInput,
  DepartureRecord,
  DisplayRecord,
  UpdateDisplayInput,
  StopSearchResult,
} from '@/api/types';
import {
  ConfigApiError,
  createDisplay,
  deleteDisplay,
  listDepartures,
  listDisplays,
  updateDisplay,
} from '@/lib/config-api';
const OWNER_ID_PATTERN = /^[A-Za-z0-9]{8}$/;
const OWNER_STORAGE_KEY = 'slpanel.owner-id';
const route = useRoute();
const router = useRouter();
const activeOwnerId = computed(() =>
  typeof route.query.owner === 'string' ? route.query.owner : '',
);
const ownerInput = ref(activeOwnerId.value);
const displays = ref<DisplayRecord[]>([]);
const selectedDisplayId = ref('new');
const draft = ref<DisplayDraft>(createEmptyDraft());
const loadingDisplays = ref(false);
const saving = ref(false);
const deleting = ref(false);
const confirmingDelete = ref(false);
const statusMessage = ref<string | null>(null);
const errorMessage = ref<string | null>(null);
const storedOwner = window.localStorage.getItem(OWNER_STORAGE_KEY);
if (!activeOwnerId.value && storedOwner && OWNER_ID_PATTERN.test(storedOwner))
  void router.replace({ query: { ...route.query, owner: storedOwner } });
watch(
  activeOwnerId,
  (owner, _previous, onCleanup) => {
    ownerInput.value = owner;
    if (owner) window.localStorage.setItem(OWNER_STORAGE_KEY, owner);
    displays.value = [];
    handleStartNewDisplay();
    loadingDisplays.value = false;
    if (!owner) return;
    const controller = new AbortController();
    onCleanup(() => controller.abort());
    loadingDisplays.value = true;
    listDisplays(owner, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        displays.value = result;
        if (result[0]) handleSelectDisplay(result[0]);
      })
      .catch((failure) => {
        if (!controller.signal.aborted)
          errorMessage.value = readErrorMessage(failure);
      })
      .finally(() => {
        if (!controller.signal.aborted) loadingDisplays.value = false;
      });
  },
  { immediate: true },
);
const polling = usePolling<DepartureRecord[]>(
  () => [draft.value.site_id, draft.value.refresh_interval],
  (signal) =>
    draft.value.site_id
      ? listDepartures(draft.value.site_id, { forecast: 240, signal })
      : null,
  () => draft.value.refresh_interval,
);
const departureHints = computed(() => polling.data.value ?? []);
const previewError = polling.error;
const loadingDepartureHints = polling.loading;
const previewDepartures = computed(() =>
  departureHints.value.filter(
    (departure) =>
      (!draft.value.line_numbers.length ||
        draft.value.line_numbers.includes(departure.line_number)) &&
      (!draft.value.directions.length ||
        draft.value.directions.includes(departure.destination)) &&
      (!draft.value.modes.length ||
        draft.value.modes.includes(departure.transport_mode)),
  ),
);
const selectedDisplay = computed(
  () =>
    displays.value.find((display) => display.id === selectedDisplayId.value) ??
    null,
);
const isCreating = computed(() => selectedDisplayId.value === 'new');
const activeDisplayCount = computed(() => displays.value.length);
const lineOptions = computed(() =>
  deriveLineOptions(departureHints.value, draft.value.modes),
);
const directionOptions = computed(() =>
  deriveDirectionOptions(
    departureHints.value,
    draft.value.line_numbers,
    draft.value.modes,
  ),
);
function handleOwnerSubmit() {
  const owner = ownerInput.value.trim();
  if (!OWNER_ID_PATTERN.test(owner)) {
    errorMessage.value = 'Owner ID must be 8 alphanumeric characters.';
    return;
  }
  void router.push({ query: { ...route.query, owner } });
  statusMessage.value = null;
  errorMessage.value = null;
}
function clearOwner() {
  window.localStorage.removeItem(OWNER_STORAGE_KEY);
  const query = { ...route.query };
  delete query.owner;
  void router.push({ query });
}
function handleStartNewDisplay() {
  selectedDisplayId.value = 'new';
  draft.value = createEmptyDraft();
  confirmingDelete.value = false;
  statusMessage.value = null;
  errorMessage.value = null;
}
function handleSelectDisplay(display: DisplayRecord) {
  selectedDisplayId.value = display.id;
  draft.value = createDraftFromDisplay(display);
  confirmingDelete.value = false;
  statusMessage.value = null;
  errorMessage.value = null;
}
function handleStopChange(stop: StopSearchResult | null) {
  draft.value.site_id = stop?.site_id ?? null;
  draft.value.site_name = stop?.name ?? null;
}
async function handleSaveDisplay() {
  if (!activeOwnerId.value) {
    errorMessage.value = 'Enter an owner ID before saving displays.';
    return;
  }
  if (!draft.value.name.trim()) {
    errorMessage.value = 'Display name is required.';
    return;
  }
  if (
    !Number.isInteger(draft.value.refresh_interval) ||
    draft.value.refresh_interval <= 0
  ) {
    errorMessage.value = 'Refresh interval must be a positive integer.';
    return;
  }
  if (saving.value || deleting.value) return;
  const owner = activeOwnerId.value;
  const creating = isCreating.value;
  const id = selectedDisplayId.value;
  saving.value = true;
  statusMessage.value = null;
  errorMessage.value = null;
  try {
    const saved = creating
      ? await createDisplay(buildCreatePayload(owner, draft.value))
      : await updateDisplay(id, buildUpdatePayload(draft.value));
    if (activeOwnerId.value !== owner) return;
    displays.value = creating
      ? [saved, ...displays.value]
      : displays.value.map((display) =>
          display.id === saved.id ? saved : display,
        );
    if (selectedDisplayId.value === id) handleSelectDisplay(saved);
    statusMessage.value = creating ? 'Display created.' : 'Display updated.';
  } catch (failure) {
    if (activeOwnerId.value === owner)
      errorMessage.value = readErrorMessage(failure);
  } finally {
    saving.value = false;
  }
}
async function handleDeleteDisplay() {
  const display = selectedDisplay.value;
  if (!display || deleting.value || saving.value) return;
  if (!confirmingDelete.value) {
    confirmingDelete.value = true;
    return;
  }
  const owner = activeOwnerId.value;
  deleting.value = true;
  statusMessage.value = null;
  errorMessage.value = null;
  try {
    await deleteDisplay(display.id);
    if (activeOwnerId.value !== owner) return;
    displays.value = displays.value.filter((item) => item.id !== display.id);
    if (selectedDisplayId.value === display.id) {
      if (displays.value[0]) handleSelectDisplay(displays.value[0]);
      else handleStartNewDisplay();
    }
    statusMessage.value = 'Display deleted.';
    confirmingDelete.value = false;
  } catch (failure) {
    if (activeOwnerId.value === owner)
      errorMessage.value = readErrorMessage(failure);
  } finally {
    deleting.value = false;
  }
}
function handleCancelDelete() {
  confirmingDelete.value = false;
}
type DisplayDraft = {
  name: string;
  site_id: string | null;
  site_name: string | null;
  refresh_interval: number;
  line_numbers: string[];
  directions: string[];
  modes: string[];
};
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
      a.value.localeCompare(b.value, undefined, {
        numeric: true,
      }),
    );
}
function deriveDirectionOptions(
  departures: DepartureRecord[],
  selectedLineNumbers: string[],
  selectedModes: string[],
): DirectionOption[] {
  const seen = new Map<
    string,
    {
      lineNumber: string;
      transportMode: string;
    }
  >();
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
</script>
<template>
  <section class="space-y-8">
    <div class="space-y-3">
      <p class="text-sm font-semibold text-[var(--muted-text)]">
        Display config
      </p>
      <div class="space-y-3">
        <h1
          class="max-w-3xl text-3xl font-semibold leading-tight text-[var(--app-text)] md:text-4xl"
        >
          Set up and manage your transit display boards.
        </h1>
        <p
          class="max-w-3xl text-sm leading-7 text-[var(--muted-text)] md:text-base"
        >
          Choose a stop, pick which lines and directions to show, and control
          how often the board refreshes. Preview changes as you edit, then save
          to update your display.
        </p>
      </div>
    </div>
    <div
      class="grid gap-6 xl:grid-cols-[minmax(16rem,19rem)_minmax(0,1fr)] xl:items-start"
    >
      <UCard as="aside" :ui="{ body: 'space-y-5 p-5 sm:p-5' }">
        <UForm
          :state="{ ownerId: ownerInput }"
          class="space-y-4"
          aria-label="Load displays by owner"
          @submit="handleOwnerSubmit"
        >
          <div class="space-y-2">
            <p class="text-sm font-semibold text-[var(--muted-text)]">
              Step 1: Owner
            </p>
            <UFormField name="ownerId" label="Owner ID">
              <UInput
                id="owner-id"
                v-model="ownerInput"
                placeholder="e.g. aB3xZ9kQ, 8 characters"
                class="w-full"
              ></UInput
            ></UFormField>
          </div>
          <div class="flex flex-wrap gap-3">
            <UButton
              variant="solid"
              type="submit"
              class="rounded border border-[var(--panel-text)] bg-[var(--panel-text)] px-4 py-2 text-sm font-medium text-white transition hover:bg-[var(--panel-text-soft)]"
            >
              Load displays
            </UButton>
            <UButton
              v-if="activeOwnerId"
              variant="outline"
              type="button"
              class="rounded border border-[var(--panel-border)] px-4 py-2 text-sm text-[var(--muted-text)] transition hover:border-[var(--panel-text)]/50 hover:text-[var(--panel-text)]"
              @click="clearOwner"
            >
              Clear owner
            </UButton>
          </div>
        </UForm>
        <div
          class="rounded border border-[var(--panel-border)] bg-slate-50 p-4"
        >
          <div class="flex items-start justify-between gap-3">
            <div class="space-y-1">
              <p class="text-sm font-semibold text-[var(--muted-text)]">
                Step 2: Pick a board
              </p>
              <h3 class="text-lg font-semibold text-[var(--app-text)]">
                <template v-if="activeDisplayCount > 0">
                  {{
                    `${activeDisplayCount} ${activeDisplayCount === 1 ? 'board' : 'boards'}`
                  }} </template
                ><template v-else>{{ 'Choose an owner' }}</template>
              </h3>
            </div>
            <UButton
              variant="outline"
              type="button"
              :disabled="!activeOwnerId"
              class="rounded border border-[var(--panel-border)] px-3 py-2 text-xs font-semibold text-[var(--panel-text)] transition hover:border-[var(--panel-text)]/70 hover:bg-[var(--panel-text)]/8 disabled:cursor-not-allowed disabled:opacity-45"
              @click="handleStartNewDisplay"
            >
              New display
            </UButton>
          </div>
          <div class="mt-4 space-y-3">
            <p v-if="loadingDisplays" class="text-sm text-[var(--muted-text)]">
              Loading displays…
            </p>
            <template v-else>
              <template v-if="displays.length > 0">
                <template v-for="display in displays" :key="display.id">
                  <UButton
                    variant="outline"
                    type="button"
                    :aria-pressed="display.id === selectedDisplayId"
                    :class="
                      [
                        'flex w-full flex-col gap-2 rounded border px-4 py-4 text-left transition',
                        display.id === selectedDisplayId
                          ? 'border-[var(--panel-text)] bg-[var(--panel-text)]/10 text-[var(--panel-text)]'
                          : 'border-[var(--panel-border)] bg-white text-[var(--app-text)] hover:border-[var(--panel-text)]/55',
                      ].join(' ')
                    "
                    @click="() => handleSelectDisplay(display)"
                  >
                    <div class="flex items-start justify-between gap-3">
                      <div>
                        <p class="font-medium">
                          {{ display.name || `Display ${display.display_id}` }}
                        </p>
                        <p class="mt-1 text-xs text-[var(--muted-text)]">
                          {{ display.site_name ?? 'No stop selected' }}
                        </p>
                      </div>
                      <span
                        class="rounded border border-current/20 px-2 py-1 text-[11px] uppercase tracking-[0.16em]"
                      >
                        {{ display.refresh_interval }}s
                      </span>
                    </div>
                    <p class="text-xs text-[var(--muted-text)]">
                      {{ describeFilters(display) }}
                    </p>
                  </UButton>
                </template> </template
              ><template v-else>
                <div
                  v-if="activeOwnerId"
                  class="rounded border border-dashed border-[var(--panel-border)] px-4 py-6 text-sm text-[var(--muted-text)]"
                >
                  No displays yet. Create the first board for this owner.
                </div>
                <p v-else class="text-sm text-[var(--muted-text)]">
                  Enter an owner ID to load or create displays.
                </p>
              </template>
            </template>
          </div>
        </div>
      </UCard>
      <UCard :ui="{ body: 'space-y-5 p-5 sm:p-5 md:p-6' }">
        <div
          class="flex flex-col gap-4 md:flex-row md:items-start md:justify-between"
        >
          <div class="space-y-2">
            <p class="text-sm font-semibold text-[var(--muted-text)]">
              Step 3:
              {{ isCreating ? 'Configure the board' : 'Edit the board' }}
            </p>
            <h3 class="text-2xl font-semibold text-[var(--app-text)]">
              {{
                isCreating
                  ? 'Create a new board configuration'
                  : draft.name || selectedDisplay?.display_id || 'Edit display'
              }}
            </h3>
            <p class="max-w-2xl text-sm leading-6 text-[var(--muted-text)]">
              Use the stop search to bind one stop, then add optional line and
              direction filters before saving.
            </p>
          </div>
        </div>
        <UAlert
          v-if="statusMessage"
          :description="statusMessage"
          role="status"
          color="success"
          variant="subtle"
          class="rounded border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-800"
        />
        <UAlert
          v-if="errorMessage"
          :description="errorMessage"
          role="alert"
          color="error"
          variant="subtle"
          class="rounded border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-800"
        />
        <figure
          class="xl:sticky xl:top-4 z-10 space-y-3 rounded-lg border border-[var(--panel-border)] bg-[var(--card-bg)] p-4 shadow-lg shadow-black/10"
        >
          <figcaption
            class="flex flex-wrap items-center justify-between gap-2 text-sm"
          >
            <span class="font-medium">Config preview</span>
            <span class="text-xs text-[var(--muted-text)]">
              Updates before saving
            </span>
          </figcaption>
          <DisplayBoard
            :key="
              JSON.stringify([
                draft.site_id,
                draft.line_numbers,
                draft.directions,
                draft.modes,
              ])
            "
            :display-name="draft.name || 'New display'"
            :site-name="draft.site_name"
            :departures="previewDepartures"
            :tone="
              !draft.site_id
                ? 'empty'
                : previewError
                  ? 'error'
                  : loadingDepartureHints && !departureHints.length
                    ? 'loading'
                    : previewDepartures.length
                      ? 'live'
                      : 'empty'
            "
            :headline="
              !draft.site_id
                ? 'Choose a stop'
                : previewError
                  ? 'Preview unavailable'
                  : loadingDepartureHints && !departureHints.length
                    ? 'Loading departures'
                    : previewDepartures.length
                      ? 'Live departures'
                      : 'No matching departures'
            "
            :detail="
              !draft.site_id
                ? 'Select a stop to preview your board.'
                : previewError || 'Preview of your current stop and filters.'
            "
          ></DisplayBoard>
        </figure>
        <UForm :state="draft" class="space-y-6" @submit="handleSaveDisplay">
          <div class="grid gap-5 md:grid-cols-2">
            <UFormField
              label="Display name"
              name="name"
              class="space-y-2 md:col-span-2"
            >
              <UInput
                id="display-name"
                v-model="draft.name"
                placeholder="e.g. Southbound platform"
                class="w-full"
              ></UInput>
            </UFormField>
            <UFormField
              label="Stop search"
              name="site_id"
              class="space-y-2 md:col-span-2"
            >
              <StopPicker
                :site-id="draft.site_id"
                :site-name="draft.site_name"
                @select="handleStopChange"
              />
            </UFormField>
            <UFormField
              label="Refresh interval (seconds)"
              name="refresh_interval"
              class="space-y-2"
            >
              <UInput
                id="refresh-interval"
                v-model.number="draft.refresh_interval"
                type="number"
                :min="1"
                :step="1"
                class="w-full"
              ></UInput>
            </UFormField>
            <UFormField
              label="Line numbers"
              name="line_numbers"
              class="space-y-2"
            >
              <FilterPicker
                id="line-numbers"
                v-model="draft.line_numbers"
                :options="lineOptions"
                :disabled="!draft.site_id"
                placeholder="e.g. 17, 18…"
              />
            </UFormField>
            <UFormField
              label="Direction filters"
              name="directions"
              class="space-y-2 md:col-span-2"
            >
              <FilterPicker
                id="directions"
                v-model="draft.directions"
                :options="directionOptions"
                :disabled="!draft.site_id"
                placeholder="e.g. Hagsätra…"
              />
            </UFormField>
          </div>
          <div
            class="flex flex-wrap gap-3 border-t border-[var(--panel-border)] pt-5"
          >
            <UButton
              variant="solid"
              type="submit"
              :disabled="!activeOwnerId || saving"
              class="rounded border border-[var(--panel-text)] bg-[var(--panel-text)] px-5 py-3 text-sm font-medium text-white transition hover:bg-[var(--panel-text-soft)] disabled:cursor-not-allowed disabled:opacity-45"
            >
              <template v-if="saving">
                {{ isCreating ? 'Creating…' : 'Saving…' }} </template
              ><template v-else>
                {{ isCreating ? 'Create display' : 'Save changes' }}
              </template>
            </UButton>
            <template v-if="!isCreating">
              <span
                v-if="confirmingDelete"
                class="inline-flex flex-wrap items-center gap-2 rounded border border-rose-400/40 bg-rose-500/10 px-2 py-1.5"
              >
                <UButton
                  variant="solid"
                  type="button"
                  :disabled="deleting"
                  class="rounded bg-rose-700 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-rose-800 disabled:cursor-not-allowed disabled:opacity-45"
                  @click="handleDeleteDisplay"
                >
                  {{ deleting ? 'Deleting…' : 'Confirm delete' }}
                </UButton>
                <UButton
                  variant="outline"
                  type="button"
                  :disabled="deleting"
                  class="rounded border border-rose-400/40 px-4 py-1.5 text-sm font-medium text-rose-800 transition hover:bg-rose-500/10 disabled:cursor-not-allowed disabled:opacity-45"
                  @click="handleCancelDelete"
                >
                  Keep board
                </UButton> </span
              ><UButton
                v-else
                variant="outline"
                type="button"
                :disabled="deleting"
                class="rounded border border-rose-400/40 px-5 py-3 text-sm font-medium text-rose-800 transition hover:bg-rose-500/10 disabled:cursor-not-allowed disabled:opacity-45"
                @click="handleDeleteDisplay"
              >
                Delete display
              </UButton>
            </template>
            <RouterLink
              v-if="selectedDisplay"
              :to="`/device?display=${encodeURIComponent(selectedDisplay.id)}`"
              class="inline-flex rounded border border-[var(--panel-border)] px-5 py-3 text-sm text-[var(--panel-text)] transition hover:border-[var(--panel-text)]"
            >
              Configure USB device
            </RouterLink>
            <RouterLink
              v-if="selectedDisplay"
              :to="`/display/${selectedDisplay.id}`"
              class="ml-auto inline-flex rounded border border-[#84d8ff]/50 bg-[#84d8ff]/8 px-5 py-3 text-sm font-medium text-[var(--panel-text)] transition hover:border-[#84d8ff]/80 hover:bg-[#84d8ff]/14"
            >
              View display
            </RouterLink>
          </div>
        </UForm>
      </UCard>
    </div>
  </section>
</template>
