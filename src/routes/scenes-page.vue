<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import OwnerWorkspace from '@/components/owner-workspace.vue';
import StopPicker from '@/components/stop-picker.vue';
import DisplayBoard from '@/components/display-board.vue';
import { useOwnerWorkspace } from '@/composables/use-owner-workspace';
import { usePolling } from '@/composables/use-polling';
import type { DepartureRecord, StopSearchResult } from '@/api/types';
import type {
  DataSourceInput,
  DataSourceRecord,
  SceneRecord,
} from '@/api/scene-types';
import { listDepartures } from '@/lib/config-api';
import {
  listScenes,
  listSources,
  removeScene,
  saveScene,
  saveSource,
} from '@/lib/scene-api';

const { owner, toWorkspace } = useOwnerWorkspace();
const scenes = ref<SceneRecord[]>([]);
const sources = ref<DataSourceRecord[]>([]);
const selectedId = ref<string | null>(null);
const editing = ref(false);
const name = ref('');
const sourceId = ref('new');
const editShared = ref(false);
const sourceDraft = ref<DataSourceInput>(emptySource());
const lines = ref('');
const directions = ref('');
const modes = ref('');
const loading = ref(false);
const saving = ref(false);
const deleting = ref(false);
const confirmDelete = ref(false);
const status = ref('');
const error = ref('');
const selectedSource = computed(() =>
  sources.value.find((item) => item.id === sourceId.value),
);
const previewSource = computed(() =>
  sourceId.value === 'new' || editShared.value
    ? sourceDraft.value
    : (selectedSource.value ?? sourceDraft.value),
);
const previewName = computed(() => name.value.trim() || 'New scene');
const fieldClass =
  'w-full rounded-lg border border-[var(--panel-border)] bg-white px-3 py-2.5 text-sm text-[var(--app-text)] focus-visible:outline-2 focus-visible:outline-sky-700';
function emptySource(): DataSourceInput {
  return {
    owner_id: owner.value,
    name: '',
    site_id: null,
    site_name: null,
    refresh_interval: 30,
    line_numbers: [],
    directions: [],
    modes: [],
  };
}
function errorText(failure: unknown) {
  return failure instanceof Error
    ? failure.message
    : 'Unable to save the scene.';
}
function clearMessages() {
  status.value = '';
  error.value = '';
}
function filtersText(source: DataSourceInput) {
  lines.value = source.line_numbers.join(', ');
  directions.value = source.directions.join(', ');
  modes.value = source.modes.join(', ');
}
function split(input: string) {
  return [
    ...new Set(
      input
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean),
    ),
  ];
}
function edit(scene: SceneRecord) {
  selectedId.value = scene.id;
  name.value = scene.name;
  sourceId.value = scene.data_source_id;
  sourceDraft.value = cloneSource(
    sources.value.find((item) => item.id === sourceId.value),
  );
  filtersText(sourceDraft.value);
  editShared.value = false;
  editing.value = true;
  confirmDelete.value = false;
  clearMessages();
}
function cloneSource(source?: DataSourceRecord): DataSourceInput {
  return source
    ? {
        owner_id: source.owner_id,
        name: source.name,
        site_id: source.site_id,
        site_name: source.site_name,
        refresh_interval: source.refresh_interval,
        line_numbers: [...source.line_numbers],
        directions: [...source.directions],
        modes: [...source.modes],
      }
    : emptySource();
}
function beginNew() {
  selectedId.value = null;
  name.value = '';
  sourceId.value = 'new';
  sourceDraft.value = emptySource();
  filtersText(sourceDraft.value);
  editShared.value = false;
  editing.value = true;
  confirmDelete.value = false;
  clearMessages();
}
function sourceChanged() {
  editShared.value = false;
  sourceDraft.value = cloneSource(selectedSource.value);
  filtersText(sourceDraft.value);
}
function stopChanged(stop: StopSearchResult | null) {
  sourceDraft.value.site_id = stop?.site_id ?? null;
  sourceDraft.value.site_name = stop?.name ?? null;
  if (stop && !sourceDraft.value.name) sourceDraft.value.name = stop.name;
}
watch(
  owner,
  (id, _old, onCleanup) => {
    let cancelled = false;
    onCleanup(() => {
      cancelled = true;
    });
    scenes.value = [];
    sources.value = [];
    editing.value = false;
    selectedId.value = null;
    clearMessages();
    if (!id) return;
    loading.value = true;
    void Promise.all([listScenes(id), listSources(id)])
      .then(([loadedScenes, loadedSources]) => {
        if (cancelled) return;
        scenes.value = loadedScenes;
        sources.value = loadedSources;
        if (loadedScenes.length === 0) beginNew();
      })
      .catch((failure) => {
        if (!cancelled) error.value = errorText(failure);
      })
      .finally(() => {
        if (!cancelled) loading.value = false;
      });
  },
  { immediate: true },
);
const previewPoll = usePolling<DepartureRecord[]>(
  () => [
    editing.value,
    previewSource.value.site_id,
    previewSource.value.refresh_interval,
  ],
  (signal) =>
    editing.value && previewSource.value.site_id
      ? listDepartures(previewSource.value.site_id, { forecast: 240, signal })
      : null,
  () => previewSource.value.refresh_interval,
);
const filteredDepartures = computed(() => {
  const source = previewSource.value;
  const lineFilters =
    sourceId.value === 'new' || editShared.value
      ? split(lines.value)
      : source.line_numbers;
  const directionFilters =
    sourceId.value === 'new' || editShared.value
      ? split(directions.value)
      : source.directions;
  const modeFilters =
    sourceId.value === 'new' || editShared.value
      ? split(modes.value).map((x) => x.toUpperCase())
      : source.modes;
  return (previewPoll.data.value ?? []).filter(
    (departure) =>
      (!lineFilters.length || lineFilters.includes(departure.line_number)) &&
      (!directionFilters.length ||
        directionFilters.includes(departure.destination)) &&
      (!modeFilters.length || modeFilters.includes(departure.transport_mode)),
  );
});
async function refreshLibrary() {
  const [nextScenes, nextSources] = await Promise.all([
    listScenes(owner.value),
    listSources(owner.value),
  ]);
  scenes.value = nextScenes;
  sources.value = nextSources;
}
async function persist() {
  if (saving.value) return;
  clearMessages();
  if (!name.value.trim()) {
    error.value = 'Scene name is required.';
    return;
  }
  saving.value = true;
  try {
    let selectedSourceId = sourceId.value;
    if (sourceId.value === 'new' || editShared.value) {
      if (!sourceDraft.value.site_id)
        throw new Error('Choose a stop before saving the scene.');
      const data: DataSourceInput = {
        ...sourceDraft.value,
        owner_id: owner.value,
        name:
          sourceDraft.value.name.trim() ||
          sourceDraft.value.site_name ||
          name.value.trim(),
        line_numbers: split(lines.value),
        directions: split(directions.value),
        modes: split(modes.value).map((item) => item.toUpperCase()),
      };
      const created = await saveSource(
        data,
        sourceId.value === 'new' ? undefined : sourceId.value,
      );
      selectedSourceId = created.id;
    }
    if (selectedSourceId === 'new' || !selectedSourceId)
      throw new Error('Choose a stop configuration.');
    const saved = await saveScene(
      {
        owner_id: owner.value,
        name: name.value.trim(),
        data_source_id: selectedSourceId,
        visualization: 'departures-list',
      },
      selectedId.value ?? undefined,
    );
    await refreshLibrary();
    edit(saved);
    status.value =
      'Scene saved. You can assign it to a device or add it to a schedule.';
  } catch (failure) {
    error.value = errorText(failure);
  } finally {
    saving.value = false;
  }
}
async function remove() {
  if (!selectedId.value || !confirmDelete.value || deleting.value) return;
  deleting.value = true;
  clearMessages();
  try {
    await removeScene(owner.value, selectedId.value);
    await refreshLibrary();
    editing.value = false;
    selectedId.value = null;
    confirmDelete.value = false;
    status.value =
      'Scene deleted. Its reusable stop configuration was preserved.';
  } catch (failure) {
    error.value = errorText(failure);
  } finally {
    deleting.value = false;
  }
}
function description(scene: SceneRecord) {
  const source = sources.value.find((item) => item.id === scene.data_source_id);
  return source
    ? (source.site_name ?? 'No stop') +
        ' · ' +
        source.refresh_interval +
        's refresh'
    : 'Source unavailable';
}
</script>
<template>
  <section class="space-y-6">
    <header class="space-y-2">
      <p
        class="text-xs font-semibold uppercase tracking-widest text-[var(--muted-text)]"
      >
        Scenes
      </p>
      <h1 class="text-3xl font-semibold md:text-4xl">Saved screen layouts</h1>
      <p class="max-w-3xl text-sm leading-6 text-[var(--muted-text)]">
        A scene combines a stop, optional filters, and a full-screen
        visualization. The same scene can be used by multiple devices and
        schedules.
      </p>
    </header>
    <OwnerWorkspace />
    <p
      v-if="status"
      role="status"
      class="rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900"
    >
      {{ status }}
    </p>
    <p
      v-if="error"
      role="alert"
      class="rounded-lg border border-rose-300 bg-rose-50 p-3 text-sm text-rose-900"
    >
      {{ error }}
    </p>
    <p v-if="loading" role="status" class="text-sm text-[var(--muted-text)]">
      Loading scenes…
    </p>
    <div
      v-else-if="owner"
      class="grid gap-5 lg:grid-cols-[minmax(245px,1fr)_minmax(0,2fr)] lg:items-start"
    >
      <UCard :ui="{ body: 'space-y-4 p-5 sm:p-5' }">
        <div class="flex items-center justify-between gap-3">
          <h2 class="text-lg font-semibold">
            Scenes
            <span class="text-sm font-normal text-[var(--muted-text)]"
              >({{ scenes.length }})</span
            >
          </h2>
          <button
            type="button"
            class="rounded-lg bg-[var(--panel-text)] px-3 py-2 text-sm font-semibold text-white"
            @click="beginNew"
          >
            + New scene
          </button>
        </div>
        <p
          v-if="!scenes.length"
          class="rounded-lg border border-dashed border-[var(--panel-border)] p-4 text-sm text-[var(--muted-text)]"
        >
          No scenes yet. Create one to show departures on your first device.
        </p>
        <div class="space-y-2">
          <button
            v-for="scene in scenes"
            :key="scene.id"
            type="button"
            :aria-pressed="selectedId === scene.id"
            class="w-full rounded-lg border px-4 py-3 text-left transition"
            :class="
              selectedId === scene.id
                ? 'border-[var(--panel-text)] bg-sky-50'
                : 'border-[var(--panel-border)] bg-white hover:border-slate-400'
            "
            @click="edit(scene)"
          >
            <span class="block text-sm font-semibold">{{ scene.name }}</span>
            <span class="mt-1 block text-xs text-[var(--muted-text)]">{{
              description(scene)
            }}</span>
          </button>
        </div>
        <p class="text-xs text-[var(--muted-text)]">
          To change what a panel shows, choose a scene on the
          <RouterLink
            :to="toWorkspace('/devices')"
            class="font-medium underline"
            >Devices</RouterLink
          >
          page.
        </p>
      </UCard>
      <UCard :ui="{ body: 'space-y-5 p-5 sm:p-6' }">
        <template v-if="!editing">
          <h2 class="text-xl font-semibold">Select a scene</h2>
          <p class="text-sm text-[var(--muted-text)]">
            Choose an existing scene to edit it, or create a new one.
          </p>
        </template>
        <template v-else>
          <div>
            <p
              class="text-xs font-semibold uppercase tracking-widest text-[var(--muted-text)]"
            >
              {{ selectedId ? 'Edit scene' : 'New scene' }}
            </p>
            <h2 class="mt-1 text-xl font-semibold">
              {{ name || 'New scene' }}
            </h2>
          </div>
          <figure
            class="space-y-2 rounded-lg border border-[var(--panel-border)] bg-slate-50 p-3"
          >
            <figcaption class="text-sm font-semibold">
              Live preview
              <span class="font-normal text-[var(--muted-text)]"
                >(not saved until you press Save)</span
              >
            </figcaption>
            <DisplayBoard
              :key="
                JSON.stringify([
                  previewSource.site_id,
                  lines,
                  directions,
                  modes,
                  sourceId,
                  editShared,
                ])
              "
              :display-name="previewName"
              :site-name="previewSource.site_name"
              :departures="filteredDepartures"
              :tone="
                !previewSource.site_id
                  ? 'empty'
                  : previewPoll.error.value
                    ? 'error'
                    : previewPoll.loading.value && !filteredDepartures.length
                      ? 'loading'
                      : filteredDepartures.length
                        ? 'live'
                        : 'empty'
              "
              :headline="
                !previewSource.site_id
                  ? 'Choose a stop'
                  : previewPoll.error.value
                    ? 'Preview unavailable'
                    : filteredDepartures.length
                      ? 'Live departures'
                      : 'No matching departures'
              "
              :detail="
                !previewSource.site_id
                  ? 'Search for a stop below.'
                  : previewPoll.error.value || 'Live preview of this scene.'
              "
            />
          </figure>
          <form class="space-y-4" @submit.prevent="persist">
            <label class="block space-y-1.5 text-sm font-medium">
              <span>Scene name</span>
              <input
                v-model="name"
                :class="fieldClass"
                required
                maxlength="120"
                placeholder="e.g. Morning commute"
              />
            </label>
            <label class="block space-y-1.5 text-sm font-medium">
              <span>Departure data source</span>
              <select
                v-model="sourceId"
                :class="fieldClass"
                @change="sourceChanged"
              >
                <option value="new">+ Configure a new stop</option>
                <option
                  v-for="source in sources"
                  :key="source.id"
                  :value="source.id"
                >
                  {{ source.name
                  }}{{ source.site_name ? ' — ' + source.site_name : '' }}
                </option>
              </select>
            </label>
            <div
              v-if="sourceId !== 'new' && !editShared"
              class="space-y-2 rounded-lg bg-slate-50 p-4 text-sm"
            >
              <p>
                <strong>{{ selectedSource?.name }}</strong> ·
                {{ selectedSource?.site_name || 'No stop' }}
              </p>
              <p class="text-xs text-[var(--muted-text)]">
                Lines: {{ selectedSource?.line_numbers.join(', ') || 'All' }} ·
                {{ selectedSource?.refresh_interval }}s refresh
              </p>
              <button
                type="button"
                class="font-semibold underline"
                @click="editShared = true"
              >
                Edit shared stop settings
              </button>
              <p class="text-xs text-amber-800">
                Shared settings affect every scene that uses this data source.
              </p>
            </div>
            <template v-else>
              <label class="block space-y-1.5 text-sm font-medium">
                <span>Stop configuration name</span>
                <input
                  v-model="sourceDraft.name"
                  :class="fieldClass"
                  placeholder="e.g. Slussen southbound"
                />
              </label>
              <div class="space-y-1.5">
                <label for="stop-search" class="text-sm font-medium"
                  >Search stop</label
                >
                <StopPicker
                  :site-id="sourceDraft.site_id"
                  :site-name="sourceDraft.site_name"
                  @select="stopChanged"
                />
              </div>
              <div class="grid gap-3 sm:grid-cols-2">
                <label class="block space-y-1.5 text-sm font-medium">
                  <span>Refresh every (seconds)</span>
                  <input
                    v-model.number="sourceDraft.refresh_interval"
                    type="number"
                    min="5"
                    max="3600"
                    required
                    :class="fieldClass"
                  />
                </label>
                <label class="block space-y-1.5 text-sm font-medium">
                  <span>Lines (optional)</span>
                  <input
                    v-model="lines"
                    :class="fieldClass"
                    placeholder="All or 17, 18"
                  />
                </label>
                <label class="block space-y-1.5 text-sm font-medium">
                  <span>Directions (optional)</span>
                  <input
                    v-model="directions"
                    :class="fieldClass"
                    placeholder="All or Hagsätra"
                  />
                </label>
                <label class="block space-y-1.5 text-sm font-medium">
                  <span>Transport modes (optional)</span>
                  <input
                    v-model="modes"
                    :class="fieldClass"
                    placeholder="All or METRO, BUS"
                  />
                </label>
              </div>
              <p class="text-xs text-[var(--muted-text)]">
                Leave filters empty to include all departures. Separate values
                with commas.
              </p>
            </template>
            <label class="block space-y-1.5 text-sm font-medium">
              <span>Full-screen visualization</span>
              <select :class="fieldClass" value="departures-list" disabled>
                <option value="departures-list">Classic departure board</option>
              </select>
            </label>
            <p class="text-xs text-[var(--muted-text)]">
              Additional visualizations will appear when supported by device
              firmware.
            </p>
            <div
              class="flex flex-wrap gap-2 border-t border-[var(--panel-border)] pt-4"
            >
              <button
                type="submit"
                :disabled="saving || deleting"
                class="rounded-lg bg-[var(--panel-text)] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                {{
                  saving
                    ? 'Saving…'
                    : selectedId
                      ? 'Save scene'
                      : 'Create scene'
                }}
              </button>
              <button
                type="button"
                class="rounded-lg border border-[var(--panel-border)] bg-white px-4 py-2.5 text-sm font-medium"
                @click="editing = false"
              >
                Close
              </button>
              <button
                v-if="selectedId"
                type="button"
                class="ml-auto text-sm font-semibold text-rose-700 underline"
                @click="confirmDelete = true"
              >
                Delete…
              </button>
            </div>
          </form>
          <div
            v-if="confirmDelete"
            class="space-y-3 rounded-lg border border-rose-300 bg-rose-50 p-4 text-sm"
          >
            <p>
              Delete this scene? Scenes used by a schedule or a device cannot be
              deleted until unlinked.
            </p>
            <button
              type="button"
              :disabled="deleting"
              class="rounded-lg bg-rose-700 px-3 py-2 font-semibold text-white"
              @click="remove"
            >
              Confirm delete
            </button>
            <button
              type="button"
              class="ml-3 underline"
              @click="confirmDelete = false"
            >
              Cancel
            </button>
          </div>
        </template>
      </UCard>
    </div>
  </section>
</template>
