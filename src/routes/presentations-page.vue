<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import StopPicker from '@/components/stop-picker.vue';
import type { DisplayRecord, StopSearchResult } from '@/api/types';
import type {
  DataSourceInput,
  DataSourceRecord,
  EffectivePresentation,
  PanelControl,
  PanelControlInput,
  PresentationRecord,
  ScheduleRuleInput,
} from '@/api/presentation-types';
import { listDisplays } from '@/lib/config-api';
import {
  getPanelControl,
  listPresentations,
  listSources,
  removePresentation,
  savePanelControl,
  savePresentation,
  saveSource,
} from '@/lib/presentation-api';

const route = useRoute();
const router = useRouter();
const owner = computed(() =>
  typeof route.query.owner === 'string' ? route.query.owner : '',
);
const displays = ref<DisplayRecord[]>([]);
const sources = ref<DataSourceRecord[]>([]);
const presentations = ref<PresentationRecord[]>([]);
const selectedDisplayId = ref('');
const control = ref<PanelControl | null>(null);
const effective = ref<EffectivePresentation | null>(null);
const loading = ref(false);
const loadingPanel = ref(false);
const saving = ref(false);
const editorOpen = ref(false);
const editingId = ref<string | null>(null);
const pendingDeleteId = ref<string | null>(null);
const status = ref('');
const error = ref('');
const overrideHours = ref('0');
const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const sourceMode = ref('new');
const editSharedSource = ref(false);
const profileName = ref('');
const sourceDraft = ref<DataSourceInput>(emptySource());
const lineText = ref('');
const directionText = ref('');
const modeText = ref('');
const selectedSource = computed(() =>
  sources.value.find((s) => s.id === sourceMode.value),
);
const busy = computed(
  () => saving.value || loading.value || loadingPanel.value,
);
const stateSummary = computed(() => {
  if (!effective.value) return 'Loading current configuration';
  if (effective.value.mode === 'off') return 'Off — no departures displayed';
  if (effective.value.mode === 'legacy') return 'Original stop configuration';
  return effective.value.presentation?.name ?? 'No presentation selected';
});
const choiceReason = computed(
  () =>
    ({
      manual: 'Manual override',
      schedule: 'Scheduled now',
      default: 'Default presentation',
      legacy: 'Original configuration',
    })[effective.value?.reason ?? 'legacy'],
);
if (!owner.value && typeof window !== 'undefined') {
  const stored = window.localStorage.getItem('slpanel.owner-id');
  if (stored && /^[A-Za-z0-9]{8}$/.test(stored))
    void router.replace({ query: { ...route.query, owner: stored } });
}
const selectClass =
  'w-full rounded-lg border border-[var(--panel-border)] bg-white px-3 py-2.5 text-sm text-[var(--app-text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700';
const inputClass = selectClass;
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
const split = (input: string) => [
  ...new Set(
    input
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
  ),
];
function sourceText(source: DataSourceInput) {
  lineText.value = source.line_numbers.join(', ');
  directionText.value = source.directions.join(', ');
  modeText.value = source.modes.join(', ');
}
function clearAlerts() {
  status.value = '';
  error.value = '';
}
function message(failure: unknown) {
  return failure instanceof Error
    ? failure.message
    : 'Could not complete the request.';
}
function beginNew() {
  clearAlerts();
  editorOpen.value = true;
  editingId.value = null;
  sourceMode.value = 'new';
  editSharedSource.value = false;
  sourceDraft.value = emptySource();
  profileName.value = '';
  sourceText(sourceDraft.value);
  pendingDeleteId.value = null;
}
function editProfile(profile: PresentationRecord) {
  clearAlerts();
  editorOpen.value = true;
  editingId.value = profile.id;
  profileName.value = profile.name;
  sourceMode.value = profile.data_source_id;
  editSharedSource.value = false;
  sourceDraft.value = {
    ...(sources.value.find((item) => item.id === profile.data_source_id) ??
      emptySource()),
  };
  sourceText(sourceDraft.value);
  pendingDeleteId.value = null;
}
function changeSource() {
  editSharedSource.value = false;
  const source = sources.value.find((item) => item.id === sourceMode.value);
  sourceDraft.value = source
    ? {
        ...source,
        line_numbers: [...source.line_numbers],
        directions: [...source.directions],
        modes: [...source.modes],
      }
    : emptySource();
  sourceText(sourceDraft.value);
}
function onStop(stop: StopSearchResult | null) {
  sourceDraft.value.site_id = stop?.site_id ?? null;
  sourceDraft.value.site_name = stop?.name ?? null;
  if (stop) sourceDraft.value.name = stop.name;
}
async function refreshLibrary() {
  const [nextSources, nextPresentations] = await Promise.all([
    listSources(owner.value),
    listPresentations(owner.value),
  ]);
  sources.value = nextSources;
  presentations.value = nextPresentations;
}
watch(
  owner,
  (id, _old, onCleanup) => {
    let cancelled = false;
    onCleanup(() => {
      cancelled = true;
    });
    displays.value = [];
    sources.value = [];
    presentations.value = [];
    selectedDisplayId.value = '';
    control.value = null;
    effective.value = null;
    clearAlerts();
    if (!id) return;
    loading.value = true;
    void Promise.all([listDisplays(id), listSources(id), listPresentations(id)])
      .then(([boards, loadedSources, loadedPresentations]) => {
        if (cancelled) return;
        displays.value = boards;
        sources.value = loadedSources;
        presentations.value = loadedPresentations;
        const requested =
          typeof route.query.display === 'string' ? route.query.display : '';
        selectedDisplayId.value = boards.some(
          (display) => display.id === requested,
        )
          ? requested
          : (boards[0]?.id ?? '');
      })
      .catch((failure) => {
        if (!cancelled) error.value = message(failure);
      })
      .finally(() => {
        if (!cancelled) loading.value = false;
      });
  },
  { immediate: true },
);
watch(selectedDisplayId, (id, _old, onCleanup) => {
  let cancelled = false;
  onCleanup(() => {
    cancelled = true;
  });
  control.value = null;
  effective.value = null;
  if (!id) return;
  if (route.query.display !== id)
    void router.replace({ query: { ...route.query, display: id } });
  loadingPanel.value = true;
  void getPanelControl(id)
    .then((result) => {
      if (cancelled) return;
      control.value = result.control;
      effective.value = result.effective;
    })
    .catch((failure) => {
      if (!cancelled) error.value = message(failure);
    })
    .finally(() => {
      if (!cancelled) loadingPanel.value = false;
    });
});
async function writeControl(input: PanelControlInput, successText: string) {
  if (!selectedDisplayId.value || saving.value) return;
  saving.value = true;
  clearAlerts();
  try {
    const result = await savePanelControl(selectedDisplayId.value, input);
    control.value = result.control;
    effective.value = result.effective;
    status.value = successText;
  } catch (failure) {
    error.value = message(failure);
  } finally {
    saving.value = false;
  }
}
function controlInput(): PanelControlInput | null {
  if (!control.value) return null;
  return {
    timezone: control.value.timezone,
    default_presentation_id: control.value.default_presentation_id,
    manual: control.value.manual,
    rules: control.value.rules.map((rule) => ({
      days: [...rule.days],
      start_time: rule.start_time,
      end_time: rule.end_time,
      mode: rule.mode,
      presentation_id: rule.presentation_id,
    })),
  };
}
async function saveSchedule() {
  const draft = controlInput();
  if (draft)
    await writeControl(draft, 'Default presentation and schedule saved.');
}
async function selectNow(
  mode: 'off' | 'presentation' | null,
  profileId: string | null = null,
) {
  const draft = controlInput();
  if (!draft) return;
  const hours = Number(overrideHours.value);
  draft.manual = mode
    ? {
        mode,
        presentation_id: mode === 'off' ? null : profileId,
        until: hours
          ? new Date(Date.now() + hours * 3600000).toISOString()
          : null,
      }
    : null;
  await writeControl(
    draft,
    mode === null
      ? 'Schedule resumed.'
      : mode === 'off'
        ? 'Panel switched off.'
        : 'Presentation switched.',
  );
}
function addRule() {
  if (!control.value) return;
  control.value.rules.push({
    id: crypto.randomUUID(),
    days: [0, 1, 2, 3, 4],
    start_time: '06:00',
    end_time: '09:00',
    mode: 'presentation',
    presentation_id: control.value.default_presentation_id,
  });
}
function updateDays(rule: ScheduleRuleInput, day: number, checked: boolean) {
  rule.days = checked
    ? [...rule.days, day].sort()
    : rule.days.filter((value) => value !== day);
}
function ruleModeChanged(rule: ScheduleRuleInput) {
  rule.presentation_id =
    rule.mode === 'off'
      ? null
      : (control.value?.default_presentation_id ??
        presentations.value[0]?.id ??
        null);
}
async function saveProfile() {
  if (!owner.value || busy.value) return;
  clearAlerts();
  const title = profileName.value.trim();
  if (!title) {
    error.value = 'Give the presentation a name.';
    return;
  }
  saving.value = true;
  try {
    let chosenSource = sourceMode.value;
    if (sourceMode.value === 'new' || editSharedSource.value) {
      if (!sourceDraft.value.site_id)
        throw new Error('Choose a stop before saving.');
      const input: DataSourceInput = {
        ...sourceDraft.value,
        owner_id: owner.value,
        name:
          sourceDraft.value.name.trim() || sourceDraft.value.site_name || title,
        line_numbers: split(lineText.value),
        directions: split(directionText.value),
        modes: split(modeText.value).map((entry) => entry.toUpperCase()),
      };
      const saved = await saveSource(
        input,
        sourceMode.value === 'new' ? undefined : sourceMode.value,
      );
      chosenSource = saved.id;
    }
    if (chosenSource === 'new')
      throw new Error('Choose or create a data source.');
    const saved = await savePresentation(
      {
        owner_id: owner.value,
        name: title,
        data_source_id: chosenSource,
        visualization: 'departures-list',
      },
      editingId.value ?? undefined,
    );
    await refreshLibrary();
    editorOpen.value = false;
    editingId.value = null;
    status.value = 'Presentation saved. Select “Show now” to activate it.';
    if (control.value && !control.value.default_presentation_id) {
      const draft = controlInput();
      if (draft) {
        draft.default_presentation_id = saved.id;
        const result = await savePanelControl(selectedDisplayId.value, draft);
        control.value = result.control;
        effective.value = result.effective;
        status.value = 'Presentation saved and set as the default.';
      }
    }
  } catch (failure) {
    error.value = message(failure);
  } finally {
    saving.value = false;
  }
}
async function deleteProfile() {
  if (!editingId.value || saving.value || !pendingDeleteId.value) return;
  saving.value = true;
  clearAlerts();
  try {
    await removePresentation(owner.value, editingId.value);
    await refreshLibrary();
    editorOpen.value = false;
    editingId.value = null;
    pendingDeleteId.value = null;
    status.value =
      'Presentation deleted. Its data source remains available for reuse.';
  } catch (failure) {
    error.value = message(failure);
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <section class="space-y-7">
    <header
      class="flex flex-col gap-3 border-b border-[var(--panel-border)] pb-6 md:flex-row md:items-end md:justify-between"
    >
      <div class="space-y-2">
        <p
          class="text-xs font-semibold uppercase tracking-widest text-[var(--muted-text)]"
        >
          Display workspace
        </p>
        <h1 class="text-3xl font-semibold md:text-4xl">
          Presentations &amp; schedules
        </h1>
        <p class="max-w-2xl text-sm leading-6 text-[var(--muted-text)]">
          Save stops once, choose what each panel shows, and schedule automatic
          changes. Each presentation fills the entire screen.
        </p>
      </div>
      <RouterLink
        :to="{ path: '/config', query: { owner } }"
        class="inline-flex w-fit rounded-lg border border-[var(--panel-border)] bg-white px-4 py-2.5 text-sm font-medium hover:border-[var(--panel-text)]"
      >
        Manage physical displays
      </RouterLink>
    </header>

    <div
      v-if="!owner"
      class="rounded-xl border border-dashed border-[var(--panel-border)] bg-white p-8"
    >
      <h2 class="text-lg font-semibold">Choose an owner first</h2>
      <p class="my-3 text-sm text-[var(--muted-text)]">
        Open My displays to load an owner ID, then return here.
      </p>
      <RouterLink class="underline font-medium" to="/config"
        >Go to My displays</RouterLink
      >
    </div>
    <template v-else>
      <div
        v-if="status"
        role="status"
        class="rounded-lg border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-900"
      >
        {{ status }}
      </div>
      <div
        v-if="error"
        role="alert"
        class="rounded-lg border border-rose-300 bg-rose-50 p-4 text-sm text-rose-900"
      >
        {{ error }}
      </div>
      <p v-if="loading" role="status" class="text-sm text-[var(--muted-text)]">
        Loading your panels and presentations…
      </p>
      <div
        v-else-if="!displays.length"
        class="rounded-xl border border-dashed border-[var(--panel-border)] bg-white p-8"
      >
        <h2 class="text-xl font-semibold">No panels yet</h2>
        <p class="my-3 text-sm text-[var(--muted-text)]">
          Create a physical display before assigning presentations.
        </p>
        <RouterLink
          class="font-medium underline"
          :to="{ path: '/config', query: { owner } }"
          >Create a display</RouterLink
        >
      </div>
      <template v-else>
        <div class="grid gap-5 xl:grid-cols-[minmax(280px,1fr)_minmax(0,2fr)]">
          <UCard :ui="{ body: 'space-y-5 p-5 sm:p-6' }">
            <div>
              <p
                class="text-xs font-semibold uppercase tracking-wide text-[var(--muted-text)]"
              >
                Step 1 · Panel
              </p>
              <h2 class="mt-1 text-xl font-semibold">What is showing?</h2>
            </div>
            <label class="block space-y-2 text-sm font-medium">
              <span>Select physical panel</span>
              <select
                v-model="selectedDisplayId"
                :class="selectClass"
                aria-label="Select physical panel"
              >
                <option
                  v-for="board in displays"
                  :key="board.id"
                  :value="board.id"
                >
                  {{ board.name || board.display_id }}
                </option>
              </select>
            </label>
            <p
              v-if="loadingPanel"
              role="status"
              class="text-sm text-[var(--muted-text)]"
            >
              Loading panel settings…
            </p>
            <template v-else-if="control">
              <div
                class="rounded-xl border border-[var(--panel-border)] bg-slate-50 p-4 space-y-2"
              >
                <p
                  class="text-xs font-semibold uppercase tracking-widest text-[var(--muted-text)]"
                >
                  {{ choiceReason }}
                </p>
                <p class="text-lg font-semibold">{{ stateSummary }}</p>
                <p
                  v-if="effective?.data_source?.site_name"
                  class="text-sm text-[var(--muted-text)]"
                >
                  {{ effective.data_source.site_name }} ·
                  {{ effective.data_source.refresh_interval }}s refresh
                </p>
                <p
                  v-if="control.manual"
                  class="text-xs text-[var(--muted-text)]"
                >
                  {{
                    control.manual.until
                      ? 'Override until ' +
                        new Date(control.manual.until).toLocaleString()
                      : 'Override stays until cleared'
                  }}
                </p>
              </div>
              <label class="block space-y-2 text-sm font-medium">
                <span>Manual override duration</span>
                <select v-model="overrideHours" :class="selectClass">
                  <option value="0">Until I resume the schedule</option>
                  <option value="1">1 hour</option>
                  <option value="3">3 hours</option>
                  <option value="12">12 hours</option>
                </select>
              </label>
              <div class="flex flex-wrap gap-2">
                <button
                  type="button"
                  :disabled="busy || !control.default_presentation_id"
                  class="rounded-lg bg-[var(--panel-text)] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                  @click="
                    selectNow('presentation', control.default_presentation_id)
                  "
                >
                  Show default now
                </button>
                <button
                  type="button"
                  :disabled="busy"
                  class="rounded-lg border border-[var(--panel-border)] bg-white px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
                  @click="selectNow('off')"
                >
                  Turn off now
                </button>
                <button
                  v-if="control.manual"
                  type="button"
                  :disabled="busy"
                  class="rounded-lg border border-[var(--panel-border)] bg-white px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
                  @click="selectNow(null)"
                >
                  Resume schedule
                </button>
              </div>
              <p class="text-xs leading-5 text-[var(--muted-text)]">
                Switching stops works with existing firmware at its next
                configuration check. True hardware blanking and fast schedule
                wake-up require the companion Rust firmware changes.
              </p>
              <RouterLink
                :to="'/display/' + selectedDisplayId"
                class="inline-block text-sm font-medium underline"
                >View live panel preview</RouterLink
              >
            </template>
          </UCard>

          <UCard :ui="{ body: 'space-y-5 p-5 sm:p-6' }">
            <div class="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p
                  class="text-xs font-semibold uppercase tracking-wide text-[var(--muted-text)]"
                >
                  Step 2 · Library
                </p>
                <h2 class="mt-1 text-xl font-semibold">Saved presentations</h2>
              </div>
              <button
                type="button"
                class="rounded-lg bg-[var(--panel-text)] px-4 py-2.5 text-sm font-semibold text-white"
                @click="beginNew"
              >
                + New presentation
              </button>
            </div>
            <p class="text-sm text-[var(--muted-text)]">
              A presentation combines a departure stop and a full-screen layout.
              Reuse a stop across multiple presentations without duplicating the
              data configuration.
            </p>
            <div
              v-if="!presentations.length"
              class="rounded-lg border border-dashed border-[var(--panel-border)] p-6 text-sm text-[var(--muted-text)]"
            >
              No presentations saved yet. Create one using a stop search.
            </div>
            <div v-else class="grid gap-3 md:grid-cols-2">
              <article
                v-for="profile in presentations"
                :key="profile.id"
                class="rounded-xl border border-[var(--panel-border)] bg-white p-4 space-y-3"
              >
                <div>
                  <h3 class="font-semibold">{{ profile.name }}</h3>
                  <p class="mt-1 text-xs text-[var(--muted-text)]">
                    {{
                      sources.find((s) => s.id === profile.data_source_id)
                        ?.site_name || 'No stop configured'
                    }}
                    · Classic departures
                  </p>
                </div>
                <div class="flex flex-wrap gap-2">
                  <button
                    type="button"
                    :disabled="busy"
                    class="rounded-lg bg-[var(--panel-text)] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                    @click="selectNow('presentation', profile.id)"
                  >
                    Show now
                  </button>
                  <button
                    type="button"
                    class="rounded-lg border border-[var(--panel-border)] px-3 py-2 text-xs font-semibold"
                    @click="editProfile(profile)"
                  >
                    Edit
                  </button>
                  <span
                    v-if="control?.default_presentation_id === profile.id"
                    class="self-center rounded-full bg-slate-100 px-2 py-1 text-xs font-medium"
                    >Default</span
                  >
                </div>
              </article>
            </div>
            <div
              v-if="editorOpen"
              class="space-y-5 rounded-xl border-2 border-[var(--panel-text)]/30 bg-slate-50 p-4 md:p-6"
            >
              <div class="flex items-center justify-between gap-3">
                <h3 class="text-lg font-semibold">
                  {{ editingId ? 'Edit presentation' : 'Create presentation' }}
                </h3>
                <button
                  type="button"
                  class="text-sm underline"
                  @click="editorOpen = false"
                >
                  Close
                </button>
              </div>
              <form class="space-y-4" @submit.prevent="saveProfile">
                <label class="block space-y-1.5 text-sm font-medium">
                  <span>Presentation name</span>
                  <input
                    v-model="profileName"
                    :class="inputClass"
                    required
                    maxlength="120"
                    placeholder="e.g. Morning commute"
                  />
                </label>
                <label class="block space-y-1.5 text-sm font-medium">
                  <span>Departure data source</span>
                  <select
                    v-model="sourceMode"
                    :class="selectClass"
                    @change="changeSource"
                  >
                    <option value="new">
                      + Create a new stop configuration
                    </option>
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
                <template v-if="sourceMode !== 'new' && !editSharedSource">
                  <div class="rounded-lg bg-white p-4 text-sm space-y-2">
                    <p>
                      <strong>{{ selectedSource?.name }}</strong> ·
                      {{ selectedSource?.site_name || 'No stop' }}
                    </p>
                    <p class="text-[var(--muted-text)]">
                      Lines:
                      {{ selectedSource?.line_numbers.join(', ') || 'All' }} ·
                      Every {{ selectedSource?.refresh_interval }} seconds
                    </p>
                    <button
                      type="button"
                      class="font-medium underline"
                      @click="editSharedSource = true"
                    >
                      Edit this shared stop configuration
                    </button>
                    <p class="text-xs text-[var(--muted-text)]">
                      Edits to a shared source affect every presentation that
                      uses it.
                    </p>
                  </div>
                </template>
                <template v-else>
                  <label class="block space-y-1.5 text-sm font-medium">
                    <span>Data source name</span>
                    <input
                      v-model="sourceDraft.name"
                      :class="inputClass"
                      maxlength="120"
                      placeholder="e.g. Slussen southbound"
                    />
                  </label>
                  <div class="space-y-1.5 text-sm font-medium">
                    <label for="stop-search">Stop search</label>
                    <StopPicker
                      :site-id="sourceDraft.site_id"
                      :site-name="sourceDraft.site_name"
                      @select="onStop"
                    />
                  </div>
                  <div class="grid gap-3 md:grid-cols-2">
                    <label class="block space-y-1.5 text-sm font-medium">
                      <span>Refresh every (seconds)</span>
                      <input
                        v-model.number="sourceDraft.refresh_interval"
                        type="number"
                        min="5"
                        max="3600"
                        required
                        :class="inputClass"
                      />
                    </label>
                    <label class="block space-y-1.5 text-sm font-medium">
                      <span>Line numbers</span>
                      <input
                        v-model="lineText"
                        :class="inputClass"
                        placeholder="All, or 17, 18"
                      />
                    </label>
                    <label class="block space-y-1.5 text-sm font-medium">
                      <span>Directions</span>
                      <input
                        v-model="directionText"
                        :class="inputClass"
                        placeholder="All, or Hagsätra"
                      />
                    </label>
                    <label class="block space-y-1.5 text-sm font-medium">
                      <span>Transport modes</span>
                      <input
                        v-model="modeText"
                        :class="inputClass"
                        placeholder="All, or METRO, BUS"
                      />
                    </label>
                  </div>
                  <p class="text-xs leading-5 text-[var(--muted-text)]">
                    Leave filters empty to include all. Separate multiple values
                    with commas.
                  </p>
                </template>
                <label class="block space-y-1.5 text-sm font-medium">
                  <span>Full-screen visualization</span>
                  <select :class="selectClass" value="departures-list" disabled>
                    <option value="departures-list">
                      Classic departure board (currently supported)
                    </option>
                  </select>
                </label>
                <p class="text-xs text-[var(--muted-text)]">
                  Additional layouts will become selectable when their Rust
                  renderers are available.
                </p>
                <div class="flex flex-wrap gap-2">
                  <button
                    type="submit"
                    :disabled="busy"
                    class="rounded-lg bg-[var(--panel-text)] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    {{
                      saving
                        ? 'Saving…'
                        : editingId
                          ? 'Save presentation'
                          : 'Create presentation'
                    }}
                  </button>
                  <button
                    type="button"
                    class="rounded-lg border border-[var(--panel-border)] bg-white px-4 py-2.5 text-sm font-semibold"
                    @click="editorOpen = false"
                  >
                    Cancel
                  </button>
                  <button
                    v-if="editingId"
                    type="button"
                    :disabled="busy"
                    class="ml-auto text-sm font-medium text-rose-700 underline"
                    @click="pendingDeleteId = editingId"
                  >
                    Delete…
                  </button>
                </div>
                <div
                  v-if="pendingDeleteId"
                  class="flex flex-wrap items-center gap-3 rounded-lg border border-rose-300 bg-rose-50 p-3 text-sm"
                >
                  <span
                    >Delete this presentation? Assigned or scheduled
                    presentations cannot be deleted.</span
                  >
                  <button
                    type="button"
                    class="rounded bg-rose-700 px-3 py-2 font-semibold text-white"
                    @click="deleteProfile"
                  >
                    Confirm delete
                  </button>
                  <button
                    type="button"
                    class="underline"
                    @click="pendingDeleteId = null"
                  >
                    Keep it
                  </button>
                </div>
              </form>
            </div>
          </UCard>
        </div>

        <UCard v-if="control" :ui="{ body: 'space-y-5 p-5 sm:p-6' }">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p
                class="text-xs font-semibold uppercase tracking-wide text-[var(--muted-text)]"
              >
                Step 3 · Automation
              </p>
              <h2 class="mt-1 text-xl font-semibold">
                Default &amp; weekly schedule
              </h2>
              <p class="mt-2 max-w-2xl text-sm text-[var(--muted-text)]">
                Outside scheduled times, the default presentation is shown.
                Manual overrides always take priority.
              </p>
            </div>
            <button
              type="button"
              :disabled="busy"
              class="rounded-lg bg-[var(--panel-text)] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
              @click="saveSchedule"
            >
              {{ saving ? 'Saving…' : 'Save schedule' }}
            </button>
          </div>
          <div class="grid gap-4 md:grid-cols-2">
            <label class="block space-y-2 text-sm font-medium">
              <span>Default presentation</span>
              <select
                v-model="control.default_presentation_id"
                :class="selectClass"
              >
                <option :value="null">
                  Use original display configuration
                </option>
                <option
                  v-for="profile in presentations"
                  :key="profile.id"
                  :value="profile.id"
                >
                  {{ profile.name }}
                </option>
              </select>
            </label>
            <label class="block space-y-2 text-sm font-medium">
              <span>Schedule timezone</span>
              <input
                v-model="control.timezone"
                :class="inputClass"
                list="common-timezones"
                placeholder="Europe/Stockholm"
              />
              <datalist id="common-timezones">
                <option value="Europe/Stockholm" />
                <option value="Europe/London" />
                <option value="Europe/Berlin" />
                <option value="UTC" />
              </datalist>
              <span class="block text-xs font-normal text-[var(--muted-text)]"
                >Local times automatically follow daylight-saving changes.</span
              >
            </label>
          </div>
          <div
            class="flex items-center justify-between gap-3 border-t border-[var(--panel-border)] pt-4"
          >
            <h3 class="font-semibold">Time windows</h3>
            <button
              type="button"
              :disabled="!presentations.length || busy"
              class="rounded-lg border border-[var(--panel-border)] bg-white px-3 py-2 text-sm font-medium disabled:opacity-50"
              @click="addRule"
            >
              + Add a time window
            </button>
          </div>
          <p
            v-if="!control.rules.length"
            class="rounded-lg border border-dashed border-[var(--panel-border)] px-4 py-6 text-sm text-[var(--muted-text)]"
          >
            No schedule set. The default presentation is used all day unless you
            select a manual override.
          </p>
          <div
            v-for="(rule, index) in control.rules"
            :key="rule.id"
            class="space-y-4 rounded-xl border border-[var(--panel-border)] bg-slate-50 p-4"
          >
            <div class="flex items-center justify-between">
              <p class="font-semibold text-sm">Time window {{ index + 1 }}</p>
              <button
                type="button"
                class="text-sm text-rose-700 underline"
                @click="control.rules.splice(index, 1)"
              >
                Remove
              </button>
            </div>
            <fieldset class="space-y-2">
              <legend class="text-sm font-medium">Repeat on</legend>
              <div class="flex flex-wrap gap-2">
                <label
                  v-for="(day, dayIndex) in weekdays"
                  :key="day"
                  class="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-[var(--panel-border)] bg-white px-3 py-2 text-xs font-medium has-[:checked]:border-sky-700 has-[:checked]:bg-sky-50"
                >
                  <input
                    type="checkbox"
                    :checked="rule.days.includes(dayIndex)"
                    @change="
                      updateDays(
                        rule,
                        dayIndex,
                        ($event.target as HTMLInputElement).checked,
                      )
                    "
                  />
                  {{ day }}
                </label>
              </div>
            </fieldset>
            <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <label class="space-y-1.5 text-sm font-medium">
                <span>From</span
                ><input
                  v-model="rule.start_time"
                  type="time"
                  :class="inputClass"
                />
              </label>
              <label class="space-y-1.5 text-sm font-medium">
                <span>Until</span
                ><input
                  v-model="rule.end_time"
                  type="time"
                  :class="inputClass"
                />
              </label>
              <label class="space-y-1.5 text-sm font-medium">
                <span>Action</span>
                <select
                  v-model="rule.mode"
                  :class="selectClass"
                  @change="ruleModeChanged(rule)"
                >
                  <option value="presentation">Show presentation</option>
                  <option value="off">Turn off</option>
                </select>
              </label>
              <label
                v-if="rule.mode === 'presentation'"
                class="space-y-1.5 text-sm font-medium"
              >
                <span>Presentation</span>
                <select v-model="rule.presentation_id" :class="selectClass">
                  <option :value="null" disabled>Choose one</option>
                  <option
                    v-for="profile in presentations"
                    :key="profile.id"
                    :value="profile.id"
                  >
                    {{ profile.name }}
                  </option>
                </select>
              </label>
            </div>
            <p class="text-xs text-[var(--muted-text)]">
              End time is exclusive. If it is earlier than start time, the
              window continues into the next day.
            </p>
          </div>
          <div
            class="flex flex-wrap items-center gap-3 border-t border-[var(--panel-border)] pt-4"
          >
            <button
              type="button"
              :disabled="busy"
              class="rounded-lg bg-[var(--panel-text)] px-5 py-3 text-sm font-semibold text-white disabled:opacity-50"
              @click="saveSchedule"
            >
              {{ saving ? 'Saving…' : 'Save default & schedule' }}
            </button>
            <p class="text-xs text-[var(--muted-text)]">
              Overlapping windows are rejected to prevent unpredictable
              behavior.
            </p>
          </div>
        </UCard>
      </template>
    </template>
  </section>
</template>
