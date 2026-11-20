<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useOwnerWorkspace } from '@/composables/use-owner-workspace';
import ConfirmDeleteDialog from '@/components/confirm-delete-dialog.vue';
import type {
  SceneRecord,
  ScheduleInput,
  ScheduleRecord,
  ScheduleRuleInput,
} from '@/api/scene-types';
import {
  listScenes,
  listSchedules,
  removeSchedule,
  saveSchedule,
} from '@/lib/scene-api';

const { owner, toWorkspace } = useOwnerWorkspace();
const schedules = ref<ScheduleRecord[]>([]);
const scenes = ref<SceneRecord[]>([]);
const selectedId = ref<string | null>(null);
const editing = ref(false);
const name = ref('');
const timezone = ref('Europe/Stockholm');
// Include UTC (not returned by supportedValuesOf) and preserve existing IANA
// aliases when editing schedules created with a different timezone spelling.
const supportedTimezones = Intl.supportedValuesOf?.('timeZone') ?? [
  'Europe/Stockholm',
  'Europe/London',
  'Europe/Berlin',
];
const timezoneOptions = computed(() =>
  [...new Set(['UTC', ...supportedTimezones, timezone.value])]
    .sort((a, b) => a.localeCompare(b))
    .map((zone) => ({ label: zone, value: zone })),
);
type EditableRule = ScheduleRuleInput & { key: string };
const rules = ref<EditableRule[]>([]);
const selectedRuleKey = ref<string | null>(null);
const selectedDay = ref(0);
const dayLabels = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const hours = [0, 6, 12, 18, 24];
function minute(time: string) {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}
const timeline = computed(() => {
  const segments: { day: number; start: number; end: number; key: string; name: string }[] = [];
  for (const rule of rules.value) {
    const start = minute(rule.start_time);
    const end = minute(rule.end_time);
    for (const day of rule.days) {
      if (start === end) {
        segments.push({ day, start: 0, end: 1440, key: rule.key, name: sceneName(rule.scene_id) });
      } else if (start < end) {
        segments.push({ day, start, end, key: rule.key, name: sceneName(rule.scene_id) });
      } else {
        segments.push({ day, start, end: 1440, key: rule.key, name: sceneName(rule.scene_id) });
        segments.push({ day: (day + 1) % 7, start: 0, end, key: rule.key, name: sceneName(rule.scene_id) });
      }
    }
  }
  return segments;
});
const overlaps = computed(() => {
  const bad = new Set<string>();
  for (let i = 0; i < timeline.value.length; i++) {
    for (let j = i + 1; j < timeline.value.length; j++) {
      const a = timeline.value[i], b = timeline.value[j];
      if (a.day === b.day && a.start < b.end && b.start < a.end) {
        bad.add(a.key); bad.add(b.key);
      }
    }
  }
  return bad;
});
const selectedRule = computed(() => rules.value.find(rule => rule.key === selectedRuleKey.value));
function selectRule(key: string, day?: number) {
  selectedRuleKey.value = key;
  if (day !== undefined) selectedDay.value = day;
}
function duplicateRule(rule: EditableRule) {
  const copy = toEditable(rule);
  rules.value.push(copy);
  selectedRuleKey.value = copy.key;
}
function removeRule(key: string) {
  rules.value = rules.value.filter(rule => rule.key !== key);
  if (selectedRuleKey.value === key) selectedRuleKey.value = rules.value[0]?.key ?? null;
}
function setDays(rule: EditableRule, days: number[]) {
  rule.days = [...days];
}
const loading = ref(false);
const saving = ref(false);
const deleting = ref(false);
const pendingDelete = ref<ScheduleRecord | null>(null);
const copyingId = ref<string | null>(null);
const status = ref('');
const error = ref('');
const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const fieldClass =
  'w-full rounded-lg border border-[var(--panel-border)] bg-white px-3 py-2.5 text-sm text-[var(--app-text)] focus-visible:outline-2 focus-visible:outline-sky-700';
const selected = computed(() =>
  schedules.value.find((item) => item.id === selectedId.value),
);
const isValidDraft = computed(
  () =>
    !!name.value.trim() &&
    overlaps.value.size === 0 &&
    rules.value.length > 0 &&
    rules.value.every((rule) => rule.days.length && !!rule.scene_id),
);
function err(failure: unknown) {
  return failure instanceof Error
    ? failure.message
    : 'Could not save schedule.';
}
function clearMessages() {
  status.value = '';
  error.value = '';
}
function toEditable(rule: ScheduleRuleInput): EditableRule {
  return { ...rule, days: [...rule.days], key: crypto.randomUUID() };
}
function edit(schedule: ScheduleRecord) {
  selectedId.value = schedule.id;
  name.value = schedule.name;
  timezone.value = schedule.timezone;
  rules.value = schedule.rules.map(toEditable);
  selectedRuleKey.value = rules.value[0]?.key ?? null;
  editing.value = true;
  pendingDelete.value = null;
  clearMessages();
}
function beginNew() {
  selectedId.value = null;
  name.value = '';
  timezone.value = 'Europe/Stockholm';
  rules.value = [];
  selectedRuleKey.value = null;
  editing.value = true;
  pendingDelete.value = null;
  clearMessages();
}
function appendRule() {
  const last = rules.value[rules.value.length - 1];
  const from = last?.end_time ?? '07:00';
  const hours = Number(from.slice(0, 2));
  const next = (hours + 2) % 24;
  const to = last ? String(next).padStart(2, '0') + from.slice(2) : '09:00';
  const added = toEditable({
      days: last ? [...last.days] : [0, 1, 2, 3, 4],
      start_time: from,
      end_time: to,
      scene_id: scenes.value[0]?.id ?? '',
    });
  rules.value.push(added);
  selectedRuleKey.value = added.key;
}
function toggleDay(rule: EditableRule, day: number, checked: boolean) {
  rule.days = checked
    ? [...new Set([...rule.days, day])].sort()
    : rule.days.filter((x) => x !== day);
}
function sceneName(id: string) {
  return (
    scenes.value.find((scene) => scene.id === id)?.name ?? 'Unavailable scene'
  );
}
function displayDays(days: number[]) {
  return days.map((day) => weekdays[day]).join(', ');
}
watch(
  owner,
  (id, _old, onCleanup) => {
    let cancelled = false;
    onCleanup(() => {
      cancelled = true;
    });
    schedules.value = [];
    scenes.value = [];
    selectedId.value = null;
    editing.value = false;
    pendingDelete.value = null;
    clearMessages();
    if (!id) return;
    loading.value = true;
    void Promise.all([listSchedules(id), listScenes(id)])
      .then(([loadedSchedules, loadedScenes]) => {
        if (cancelled) return;
        schedules.value = loadedSchedules;
        scenes.value = loadedScenes;
        if (!loadedSchedules.length) beginNew();
      })
      .catch((failure) => {
        if (!cancelled) error.value = err(failure);
      })
      .finally(() => {
        if (!cancelled) loading.value = false;
      });
  },
  { immediate: true },
);
async function refreshSchedules() {
  schedules.value = await listSchedules(owner.value);
}
async function persist() {
  if (saving.value) return;
  clearMessages();
  if (!isValidDraft.value) {
    error.value =
      'Enter a schedule name and at least one complete time window with a scene.';
    return;
  }
  const input: ScheduleInput = {
    owner_id: owner.value,
    name: name.value.trim(),
    timezone: timezone.value.trim(),
    rules: rules.value.map(({ days, start_time, end_time, scene_id }) => ({
      days: [...days],
      start_time,
      end_time,
      scene_id,
    })),
  };
  saving.value = true;
  try {
    const saved = await saveSchedule(input, selectedId.value ?? undefined);
    await refreshSchedules();
    edit(saved);
    status.value =
      'Schedule saved. Any devices using this schedule will use the updated windows.';
  } catch (failure) {
    error.value = err(failure);
  } finally {
    saving.value = false;
  }
}
async function copySchedule(schedule: ScheduleRecord) {
  if (copyingId.value || saving.value || deleting.value) return;
  copyingId.value = schedule.id;
  clearMessages();
  try {
    const copy = await saveSchedule({
      owner_id: owner.value,
      name: ('Copy of ' + schedule.name).slice(0, 120),
      timezone: schedule.timezone,
      rules: schedule.rules.map(({ days, start_time, end_time, scene_id }) => ({
        days: [...days],
        start_time,
        end_time,
        scene_id,
      })),
    });
    if (owner.value !== schedule.owner_id) return;
    await refreshSchedules();
    edit(copy);
    status.value = 'Schedule copied. The original schedule is unchanged.';
  } catch (failure) {
    error.value = err(failure);
  } finally {
    copyingId.value = null;
  }
}

async function remove() {
  const schedule = pendingDelete.value;
  if (!schedule || deleting.value) return;
  deleting.value = true;
  clearMessages();
  try {
    await removeSchedule(schedule.owner_id, schedule.id);
    if (owner.value !== schedule.owner_id) return;
    await refreshSchedules();
    pendingDelete.value = null;
    if (selectedId.value === schedule.id) {
      editing.value = false;
      selectedId.value = null;
    }
    status.value = 'Schedule deleted. Scenes are unchanged.';
  } catch (failure) {
    error.value = err(failure);
  } finally {
    deleting.value = false;
  }
}
</script>

<template>
  <section class="space-y-6">
    <header class="space-y-2">
      <p
        class="text-xs font-semibold uppercase tracking-widest text-[var(--muted-text)]"
      >
        Schedules
      </p>
      <h1 class="text-3xl font-semibold md:text-4xl">
        Shared weekly schedules
      </h1>
      <p class="max-w-3xl text-sm leading-6 text-[var(--muted-text)]">
        Choose which scene appears at each time of the week. Multiple devices
        can share one schedule, so a single change updates all of them.
      </p>
    </header>
    <div
      class="flex items-start gap-3 rounded-xl border border-[var(--panel-border)] bg-slate-50 p-4"
    >
      <span class="grid size-10 shrink-0 place-items-center rounded-lg bg-white"
        ><UIcon name="i-lucide-moon" class="size-5"
      /></span>
      <div>
        <p class="font-semibold">Off is always the default</p>
        <p class="mt-1 text-sm leading-6 text-[var(--muted-text)]">
          When no time window matches, every device using this schedule is Off.
          You cannot change this default. Add time windows only for scenes you
          want to show.
        </p>
      </div>
    </div>
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
    <p v-if="loading" role="status">Loading schedules…</p>
    <div
      v-else-if="owner"
      class="grid gap-5 lg:grid-cols-[minmax(245px,1fr)_minmax(0,2fr)] lg:items-start"
    >
      <UCard :ui="{ body: 'space-y-4 p-5 sm:p-5' }">
        <div class="flex items-center justify-between gap-3">
          <h2 class="text-lg font-semibold">
            Schedules
            <span class="text-sm font-normal text-[var(--muted-text)]"
              >({{ schedules.length }})</span
            >
          </h2>
          <button
            type="button"
            class="rounded-lg bg-[var(--panel-text)] px-3 py-2 text-sm font-semibold text-white"
            @click="beginNew"
          >
            + New
          </button>
        </div>
        <div
          v-if="!schedules.length"
          class="rounded-lg border border-dashed border-[var(--panel-border)] p-4 text-sm text-[var(--muted-text)]"
        >
          No schedules yet. Define a few scene windows to get started.
        </div>
        <div class="space-y-2">
          <div
            v-for="schedule in schedules"
            :key="schedule.id"
            class="flex items-center gap-1 rounded-lg border p-1.5 transition"
            :class="
              selectedId === schedule.id
                ? 'border-[var(--panel-text)] bg-sky-50'
                : 'border-[var(--panel-border)] bg-white hover:border-slate-400'
            "
          >
            <button
              type="button"
              :aria-pressed="selectedId === schedule.id"
              class="min-w-0 flex-1 rounded-md px-3 py-2 text-left focus-visible:outline-2 focus-visible:outline-sky-700"
              @click="edit(schedule)"
            >
              <span class="block text-sm font-semibold">{{
                schedule.name
              }}</span>
              <span class="mt-1 block text-xs text-[var(--muted-text)]">
                {{ schedule.rules.length }} time
                {{ schedule.rules.length === 1 ? 'window' : 'windows' }} · Off
                otherwise
              </span>
            </button>
            <button
              type="button"
              :aria-label="'Copy schedule ' + schedule.name"
              :disabled="!!copyingId || saving || deleting"
              class="shrink-0 rounded-md p-2.5 text-[var(--app-text)] hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-sky-700 disabled:opacity-50"
              @click="copySchedule(schedule)"
            >
              <UIcon name="i-lucide-copy" class="size-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              :aria-label="'Delete schedule ' + schedule.name"
              class="shrink-0 rounded-md p-2.5 text-rose-700 hover:bg-rose-100 focus-visible:outline-2 focus-visible:outline-rose-700"
              @click="pendingDelete = schedule"
            >
              <UIcon
                name="i-lucide-trash-2"
                class="size-4"
                aria-hidden="true"
              />
            </button>
          </div>
        </div>
        <p class="text-xs text-[var(--muted-text)]">
          A schedule does not belong to a single device. Assign it on the
          <RouterLink
            :to="toWorkspace('/devices')"
            class="font-semibold underline"
            >Devices</RouterLink
          >
          page.
        </p>
      </UCard>
      <UCard :ui="{ body: 'space-y-5 p-5 sm:p-6' }">
        <template v-if="!editing">
          <h2 class="text-xl font-semibold">Select a schedule</h2>
          <p class="text-sm text-[var(--muted-text)]">
            Choose an existing schedule or create a new one.
          </p>
        </template>
        <template v-else>
          <div>
            <p
              class="text-xs font-semibold uppercase tracking-widest text-[var(--muted-text)]"
            >
              {{ selected ? 'Edit schedule' : 'New schedule' }}
            </p>
            <h2 class="mt-1 text-xl font-semibold">
              {{ name || 'Untitled schedule' }}
            </h2>
          </div>
          <form class="space-y-5" @submit.prevent="persist">
            <div class="grid gap-4 sm:grid-cols-2">
              <label class="block space-y-1.5 text-sm font-medium">
                <span>Schedule name</span>
                <input
                  v-model="name"
                  required
                  maxlength="120"
                  :class="fieldClass"
                  placeholder="e.g. Workdays"
                />
              </label>
              <div class="space-y-1.5 text-sm font-medium">
                <label for="schedule-timezone" class="block">Timezone</label>
                <USelectMenu
                  id="schedule-timezone"
                  v-model="timezone"
                  :items="timezoneOptions"
                  value-key="value"
                  :search-input="{ placeholder: 'Search timezones…' }"
                  placeholder="Choose a timezone"
                  class="w-full"
                  :ui="{ base: 'h-10 min-h-10' }"
                />
              </div>
            </div>
            <div class="space-y-3">
              <div class="flex flex-wrap items-center justify-between gap-2">
                <h3 class="text-lg font-semibold">Scene time windows</h3>
                <button
                  type="button"
                  :disabled="!scenes.length"
                  class="rounded-lg border border-[var(--panel-border)] bg-white px-4 py-2 text-sm font-semibold disabled:opacity-50"
                  @click="appendRule"
                >
                  + Add time window
                </button>
              </div>
              <p class="text-xs leading-5 text-[var(--muted-text)]">
                Times are local to {{ timezone || 'the chosen timezone' }}. End
                times are exclusive. Windows may span midnight, but they cannot
                overlap.
              </p>
              <div
                v-if="!scenes.length"
                class="rounded-lg border border-dashed border-amber-300 bg-amber-50 p-4 text-sm text-amber-900"
              >
                Create a
                <RouterLink
                  :to="toWorkspace('/scenes')"
                  class="font-semibold underline"
                  >scene</RouterLink
                >
                before setting up the schedule.
              </div>
              <div
                v-else-if="!rules.length"
                class="rounded-lg border border-dashed border-[var(--panel-border)] p-6 text-sm text-[var(--muted-text)]"
              >
                No windows added. The schedule would remain Off all week. Add at
                least one window to save.
              </div>
              <div v-if="rules.length" class="space-y-3">
                <div class="rounded-xl border border-[var(--panel-border)] bg-white p-3 sm:p-4">
                  <div class="mb-3 flex items-center justify-between gap-2">
                    <h4 class="text-sm font-semibold">Weekly overview</h4>
                    <span class="text-xs text-[var(--muted-text)]">Select a block to edit · grey means Off</span>
                  </div>
                  <div class="grid grid-cols-[3.5rem_minmax(0,1fr)] gap-x-2 gap-y-1.5">
                    <div></div>
                    <div class="flex justify-between text-[10px] text-[var(--muted-text)]">
                      <span v-for="hour in hours" :key="hour">{{ String(hour).padStart(2, '0') }}</span>
                    </div>
                    <template v-for="(day, dayIndex) in dayLabels" :key="day">
                      <button type="button" class="text-left text-xs font-medium" :class="selectedDay === dayIndex ? 'text-sky-800' : 'text-[var(--muted-text)]'" @click="selectedDay = dayIndex">{{ day.slice(0, 3) }}</button>
                      <div class="relative h-9 overflow-hidden rounded-md bg-slate-100" :aria-label="day + ' timeline'">
                        <div v-for="hour in [6, 12, 18]" :key="hour" class="pointer-events-none absolute inset-y-0 border-l border-white/80" :style="{ left: (hour / 24 * 100) + '%' }"></div>
                        <button v-for="segment in timeline.filter(item => item.day === dayIndex)" :key="segment.key + '-' + segment.start"
                          type="button" :title="segment.name + ' · ' + day"
                          :aria-label="'Edit ' + segment.name + ' on ' + day"
                          class="absolute inset-y-1 overflow-hidden rounded px-1 text-left text-[10px] font-medium text-white focus-visible:outline-2 focus-visible:outline-sky-900"
                          :class="overlaps.has(segment.key) ? 'bg-rose-600' : selectedRuleKey === segment.key ? 'bg-sky-800 ring-2 ring-sky-400' : 'bg-teal-700'"
                          :style="{ left: (segment.start / 1440 * 100) + '%', width: ((segment.end - segment.start) / 1440 * 100) + '%' }"
                          @click="selectRule(segment.key, dayIndex)">
                          <span class="block truncate">{{ segment.name }}</span>
                        </button>
                      </div>
                    </template>
                  </div>
                  <p class="mt-3 text-xs text-[var(--muted-text)]">Overnight windows continue onto the next day. Select a window below if it is too short to tap on the timeline.</p>
                </div>
                <div class="flex flex-wrap gap-2" aria-label="Time windows">
                  <button v-for="(rule, index) in rules" :key="rule.key" type="button"
                    class="rounded-lg border px-3 py-2 text-left text-xs"
                    :class="selectedRuleKey === rule.key ? 'border-sky-700 bg-sky-50' : 'border-[var(--panel-border)] bg-white'"
                    :aria-pressed="selectedRuleKey === rule.key" @click="selectRule(rule.key)">
                    <strong>Window {{ index + 1 }}</strong> · {{ rule.start_time }}–{{ rule.end_time }}
                    <span class="block text-[var(--muted-text)]">{{ sceneName(rule.scene_id) }}</span>
                  </button>
                </div>
                <div v-if="selectedRule" class="space-y-4 rounded-xl border border-sky-200 bg-slate-50 p-4">
                  <div class="flex flex-wrap items-center justify-between gap-2">
                    <h4 class="font-semibold">Edit selected window</h4>
                    <div class="flex gap-3">
                      <button type="button" class="text-sm font-medium underline" @click="duplicateRule(selectedRule)">Duplicate</button>
                      <button type="button" class="text-sm font-medium text-rose-700 underline" @click="removeRule(selectedRule.key)">Remove</button>
                    </div>
                  </div>
                  <fieldset class="space-y-2">
                    <legend class="text-sm font-semibold">Repeat on</legend>
                    <div class="flex flex-wrap gap-2">
                      <button type="button" class="rounded-md border bg-white px-2 py-1 text-xs" @click="setDays(selectedRule, [0,1,2,3,4])">Weekdays</button>
                      <button type="button" class="rounded-md border bg-white px-2 py-1 text-xs" @click="setDays(selectedRule, [5,6])">Weekend</button>
                      <button type="button" class="rounded-md border bg-white px-2 py-1 text-xs" @click="setDays(selectedRule, [0,1,2,3,4,5,6])">Every day</button>
                    </div>
                    <div class="flex flex-wrap gap-2">
                      <label v-for="(day, dayIndex) in weekdays" :key="day" class="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-[var(--panel-border)] bg-white px-2.5 py-2 text-xs font-medium has-[:checked]:border-sky-700 has-[:checked]:bg-sky-50">
                        <input type="checkbox" :checked="selectedRule.days.includes(dayIndex)" @change="toggleDay(selectedRule, dayIndex, ($event.target as HTMLInputElement).checked)" />{{ day }}
                      </label>
                    </div>
                  </fieldset>
                  <div class="grid gap-3 sm:grid-cols-3">
                    <label class="block space-y-1.5 text-sm font-medium"><span>From</span><input v-model="selectedRule.start_time" type="time" required :class="fieldClass" /></label>
                    <label class="block space-y-1.5 text-sm font-medium"><span>Until</span><input v-model="selectedRule.end_time" type="time" required :class="fieldClass" /></label>
                    <label class="block space-y-1.5 text-sm font-medium"><span>Scene</span>
                      <select v-model="selectedRule.scene_id" required :class="fieldClass">
                        <option disabled value="">Choose a scene</option>
                        <option v-for="scene in scenes" :key="scene.id" :value="scene.id">{{ scene.name }}</option>
                      </select>
                    </label>
                  </div>
                  <p v-if="overlaps.has(selectedRule.key)" role="alert" class="text-sm font-semibold text-rose-700">This window overlaps another window. Adjust the times or days before saving.</p>
                </div>
              </div>
              <div
                v-if="rules.length"
                class="flex items-start gap-2 rounded-lg border border-[var(--panel-border)] bg-white p-4 text-sm"
              >
                <UIcon name="i-lucide-moon" class="mt-0.5 size-4 shrink-0" />
                <span
                  ><strong>Off at all other times.</strong> No default scene or
                  Off time window is needed.</span
                >
              </div>
            </div>
            <div
              class="flex flex-wrap gap-2 border-t border-[var(--panel-border)] pt-4"
            >
              <button
                type="submit"
                :disabled="saving || deleting || !isValidDraft"
                class="rounded-lg bg-[var(--panel-text)] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                {{
                  saving
                    ? 'Saving…'
                    : selectedId
                      ? 'Save schedule'
                      : 'Create schedule'
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
                @click="pendingDelete = selected ?? null"
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
      kind="schedule"
      :name="pendingDelete?.name || ''"
      :loading="deleting"
      @update:open="pendingDelete = $event ? pendingDelete : null"
      @confirm="remove"
    />
  </section>
</template>
