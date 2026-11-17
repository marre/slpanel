<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import StopPicker from '@/components/stop-picker.vue';
import FilterPicker from '@/components/filter-picker.vue';
import DisplayBoard from '@/components/display-board.vue';
import ConfirmDeleteDialog from '@/components/confirm-delete-dialog.vue';
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
  directionOptions,
  lineOptions,
  sourceSaveDecision,
  transportModeOptions,
} from '@/lib/scene-editor';
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
const sourceDraft = ref<DataSourceInput>(emptySource());
const lines = ref<string[]>([]);
const directions = ref<string[]>([]);
const modes = ref<string[]>([]);
const loading = ref(false);
const saving = ref(false);
const deleting = ref(false);
const pendingDelete = ref<SceneRecord | null>(null);
const copyingId = ref<string | null>(null);
const status = ref('');
const error = ref('');
const previewSource = computed(() => sourceDraft.value);
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
  lines.value = [...source.line_numbers];
  directions.value = [...source.directions];
  modes.value = [...source.modes];
}
function modesChanged(values: string[]) {
  modes.value = [
    ...new Set(
      values.map((value) => value.trim().toUpperCase()).filter(Boolean),
    ),
  ];
}
function edit(scene: SceneRecord) {
  selectedId.value = scene.id;
  name.value = scene.name;
  sourceDraft.value = cloneSource(
    sources.value.find((item) => item.id === scene.data_source_id),
  );
  filtersText(sourceDraft.value);
  editing.value = true;
  pendingDelete.value = null;
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
  sourceDraft.value = emptySource();
  filtersText(sourceDraft.value);
  editing.value = true;
  pendingDelete.value = null;
  clearMessages();
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
    pendingDelete.value = null;
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
const departureHints = computed(() => previewPoll.data.value ?? []);
const availableModes = computed(() => {
  const options = [...transportModeOptions];
  for (const mode of [
    ...modes.value,
    ...departureHints.value.map((d) => d.transport_mode),
  ]) {
    if (!options.some((option) => option.value === mode)) {
      options.push({ value: mode, label: mode, transportMode: '' });
    }
  }
  return options;
});
const availableLines = computed(() =>
  lineOptions(departureHints.value, modes.value),
);
const availableDirections = computed(() =>
  directionOptions(departureHints.value, lines.value, modes.value),
);
const filteredDepartures = computed(() =>
  departureHints.value.filter(
    (departure) =>
      (!lines.value.length || lines.value.includes(departure.line_number)) &&
      (!directions.value.length ||
        directions.value.includes(departure.destination)) &&
      (!modes.value.length || modes.value.includes(departure.transport_mode)),
  ),
);
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
    if (!sourceDraft.value.site_id)
      throw new Error('Choose a stop before saving the scene.');
    const data: DataSourceInput = {
      ...sourceDraft.value,
      owner_id: owner.value,
      name:
        sourceDraft.value.name.trim() ||
        sourceDraft.value.site_name ||
        name.value.trim(),
      line_numbers: [...lines.value],
      directions: [...directions.value],
      modes: [...modes.value],
    };
    const scene = scenes.value.find((item) => item.id === selectedId.value);
    const source = sources.value.find(
      (item) => item.id === scene?.data_source_id,
    );
    const decision = sourceSaveDecision(
      source,
      scenes.value,
      selectedId.value,
      data,
    );
    let selectedSourceId = source?.id;
    if (decision.save) {
      const savedSource = await saveSource(data, decision.updateId);
      selectedSourceId = savedSource.id;
    }
    if (!selectedSourceId)
      throw new Error('Could not save stop configuration.');
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
async function copyScene(scene: SceneRecord) {
  if (copyingId.value || saving.value || deleting.value) return;
  copyingId.value = scene.id;
  clearMessages();
  try {
    const copy = await saveScene({
      owner_id: owner.value,
      name: ('Copy of ' + scene.name).slice(0, 120),
      data_source_id: scene.data_source_id,
      visualization: scene.visualization,
    });
    if (owner.value !== scene.owner_id) return;
    await refreshLibrary();
    edit(copy);
    status.value = 'Scene copied. Edit the copy without changing the original.';
  } catch (failure) {
    error.value = errorText(failure);
  } finally {
    copyingId.value = null;
  }
}

async function remove() {
  const scene = pendingDelete.value;
  if (!scene || deleting.value) return;
  deleting.value = true;
  clearMessages();
  try {
    await removeScene(scene.owner_id, scene.id);
    if (owner.value !== scene.owner_id) return;
    await refreshLibrary();
    pendingDelete.value = null;
    if (selectedId.value === scene.id) {
      editing.value = false;
      selectedId.value = null;
    }
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
          <div
            v-for="scene in scenes"
            :key="scene.id"
            class="flex items-stretch gap-2"
          >
            <button
              type="button"
              :aria-pressed="selectedId === scene.id"
              class="min-w-0 flex-1 rounded-lg border px-4 py-3 text-left transition"
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
            <div class="flex items-center gap-1">
              <button
                type="button"
                :aria-label="'Copy scene ' + scene.name"
                :disabled="!!copyingId || saving || deleting"
                class="rounded-lg border border-[var(--panel-border)] p-2.5 hover:bg-slate-50 disabled:opacity-50"
                @click="copyScene(scene)"
              >
                <UIcon name="i-lucide-copy" class="size-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                :aria-label="'Delete scene ' + scene.name"
                class="rounded-lg border border-rose-200 p-2.5 text-rose-700 hover:bg-rose-50"
                @click="pendingDelete = scene"
              >
                <UIcon
                  name="i-lucide-trash-2"
                  class="size-4"
                  aria-hidden="true"
                />
              </button>
            </div>
          </div>
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
            <div class="space-y-1.5">
              <label for="transport-modes" class="text-sm font-medium">
                Transport modes (optional)
              </label>
              <FilterPicker
                id="transport-modes"
                :model-value="modes"
                :options="availableModes"
                :disabled="!sourceDraft.site_id"
                placeholder="All transport modes"
                @update:model-value="modesChanged"
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
              <div class="space-y-1.5">
                <label for="line-numbers" class="text-sm font-medium">
                  Lines (optional)
                </label>
                <FilterPicker
                  id="line-numbers"
                  v-model="lines"
                  :options="availableLines"
                  :disabled="!sourceDraft.site_id"
                  placeholder="All lines"
                />
              </div>
              <div class="space-y-1.5 sm:col-span-2">
                <label for="directions" class="text-sm font-medium">
                  Directions (optional)
                </label>
                <FilterPicker
                  id="directions"
                  v-model="directions"
                  :options="availableDirections"
                  :disabled="!sourceDraft.site_id"
                  placeholder="All directions"
                />
              </div>
            </div>
            <p class="text-xs text-[var(--muted-text)]">
              Leave filters empty to include all departures. Line suggestions
              follow the selected transport modes, and directions follow the
              selected lines.
            </p>
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
                @click="
                  pendingDelete =
                    scenes.find((item) => item.id === selectedId) ?? null
                "
              >
                Delete…
              </button>
            </div>
          </form>
        </template>
      </UCard>
    </div>
    <ConfirmDeleteDialog
      :open="!!pendingDelete"
      kind="scene"
      :name="pendingDelete?.name || ''"
      :loading="deleting"
      @update:open="pendingDelete = $event ? pendingDelete : null"
      @confirm="remove"
    />
  </section>
</template>
