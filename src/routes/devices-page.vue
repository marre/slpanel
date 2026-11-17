<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import ConfirmDeleteDialog from '@/components/confirm-delete-dialog.vue';
import { useOwnerWorkspace } from '@/composables/use-owner-workspace';
import type { DisplayRecord } from '@/api/types';
import type {
  DeviceAssignment,
  EffectiveScene,
  SceneRecord,
  ScheduleRecord,
} from '@/api/scene-types';
import {
  createDisplay,
  deleteDisplay,
  listDisplays,
  updateDisplay,
} from '@/lib/config-api';
import {
  getDeviceConfiguration,
  listScenes,
  listSchedules,
  saveDeviceAssignment,
} from '@/lib/scene-api';

const route = useRoute();
const router = useRouter();
const { owner, toWorkspace } = useOwnerWorkspace();
const displays = ref<DisplayRecord[]>([]);
const scenes = ref<SceneRecord[]>([]);
const schedules = ref<ScheduleRecord[]>([]);
const selectedId = ref('new');
const name = ref('');
const targetKind = ref<'scene' | 'schedule'>('scene');
const targetId = ref('');
const assignment = ref<DeviceAssignment | null>(null);
const effective = ref<EffectiveScene | null>(null);
const loading = ref(false);
const loadingDevice = ref(false);
const saving = ref(false);
const deleting = ref(false);
const pendingDelete = ref<DisplayRecord | null>(null);
const status = ref('');
const error = ref('');
const selected = computed(
  () => displays.value.find((item) => item.id === selectedId.value) ?? null,
);
const creating = computed(() => selectedId.value === 'new');
const targets = computed(() =>
  targetKind.value === 'scene' ? scenes.value : schedules.value,
);
const targetLabel = computed(() =>
  targetKind.value === 'scene' ? 'scene' : 'schedule',
);
const canSave = computed(
  () =>
    !saving.value &&
    !deleting.value &&
    !!owner.value &&
    !!name.value.trim() &&
    !!targetId.value,
);
const label = computed(() => {
  if (!effective.value)
    return selected.value
      ? 'Loading configuration…'
      : 'Choose a scene or schedule';
  if (effective.value.mode === 'off') return 'Off — outside scheduled windows';
  if (effective.value.scene) return effective.value.scene.name;
  return 'Not configured';
});
const fieldClass =
  'w-full rounded-lg border border-[var(--panel-border)] bg-white px-3 py-2.5 text-sm text-[var(--app-text)] focus-visible:outline-2 focus-visible:outline-sky-700';
function clearMessages() {
  status.value = '';
  error.value = '';
}
function errorText(failure: unknown) {
  return failure instanceof Error
    ? failure.message
    : 'Unable to save the device.';
}
function chooseTarget(kind: 'scene' | 'schedule') {
  targetKind.value = kind;
  targetId.value =
    (kind === 'scene' ? scenes.value[0]?.id : schedules.value[0]?.id) ?? '';
}
function beginCreate() {
  selectedId.value = 'new';
  name.value = '';
  chooseTarget(scenes.value.length ? 'scene' : 'schedule');
  assignment.value = null;
  effective.value = null;
  pendingDelete.value = null;
  clearMessages();
}
function selectDevice(device: DisplayRecord) {
  selectedId.value = device.id;
  name.value = device.name;
  pendingDelete.value = null;
  clearMessages();
}
watch(
  owner,
  (value, _old, onCleanup) => {
    let canceled = false;
    onCleanup(() => {
      canceled = true;
    });
    displays.value = [];
    scenes.value = [];
    schedules.value = [];
    selectedId.value = 'new';
    name.value = '';
    assignment.value = null;
    effective.value = null;
    pendingDelete.value = null;
    clearMessages();
    if (!value) return;
    loading.value = true;
    void Promise.all([
      listDisplays(value),
      listScenes(value),
      listSchedules(value),
    ])
      .then(([loaded, loadedScenes, loadedSchedules]) => {
        if (canceled) return;
        displays.value = loaded;
        scenes.value = loadedScenes;
        schedules.value = loadedSchedules;
        const requested =
          typeof route.query.device === 'string' ? route.query.device : '';
        const first = loaded.find((item) => item.id === requested) ?? loaded[0];
        if (first) selectDevice(first);
        else beginCreate();
      })
      .catch((failure) => {
        if (!canceled) error.value = errorText(failure);
      })
      .finally(() => {
        if (!canceled) loading.value = false;
      });
  },
  { immediate: true },
);
watch(selectedId, (id, _old, onCleanup) => {
  let canceled = false;
  onCleanup(() => {
    canceled = true;
  });
  assignment.value = null;
  effective.value = null;
  if (id === 'new') return;
  loadingDevice.value = true;
  void getDeviceConfiguration(id)
    .then((response) => {
      if (canceled) return;
      assignment.value = response.assignment;
      effective.value = response.effective;
      if (response.assignment) {
        targetKind.value = response.assignment.kind;
        targetId.value =
          response.assignment.scene_id ?? response.assignment.schedule_id ?? '';
      } else chooseTarget('scene');
    })
    .catch((failure) => {
      if (!canceled) error.value = errorText(failure);
    })
    .finally(() => {
      if (!canceled) loadingDevice.value = false;
    });
});
watch(selectedId, (value) => {
  if (value === 'new') return;
  if (route.query.device !== value)
    void router.replace({ query: { ...route.query, device: value } });
});
async function saveDevice() {
  if (!canSave.value) return;
  saving.value = true;
  clearMessages();
  try {
    let record: DisplayRecord;
    if (creating.value) {
      record = await createDisplay({
        owner_id: owner.value,
        name: name.value.trim(),
        site_id: null,
        site_name: null,
        refresh_interval: 30,
        line_numbers: [],
        directions: [],
        modes: [],
      });
    } else {
      const current = selected.value;
      if (!current) throw new Error('Choose a device.');
      record =
        current.name !== name.value.trim()
          ? await updateDisplay(current.id, { name: name.value.trim() })
          : current;
    }
    // Assignment is mandatory in this workspace, even though legacy API
    // clients can still create an unconfigured physical display.
    const updated = await saveDeviceAssignment(record.id, {
      kind: targetKind.value,
      scene_id: targetKind.value === 'scene' ? targetId.value : null,
      schedule_id: targetKind.value === 'schedule' ? targetId.value : null,
    });
    if (record.owner_id !== owner.value) return;
    displays.value = creating.value
      ? [...displays.value, record]
      : displays.value.map((item) => (item.id === record.id ? record : item));
    selectedId.value = record.id;
    assignment.value = updated.assignment;
    effective.value = updated.effective;
    status.value = 'Device saved. Its physical ID remains unchanged.';
  } catch (failure) {
    error.value = errorText(failure);
    // If device creation succeeded but assignment failed it can be recovered
    // via refreshing the devices list and assigning a target.
  } finally {
    saving.value = false;
  }
}
async function removeDevice() {
  const device = pendingDelete.value;
  if (!device || deleting.value) return;
  deleting.value = true;
  clearMessages();
  try {
    await deleteDisplay(device.id);
    if (owner.value !== device.owner_id) return;
    displays.value = displays.value.filter((item) => item.id !== device.id);
    pendingDelete.value = null;
    if (selectedId.value === device.id) {
      const next = displays.value[0];
      if (next) selectDevice(next);
      else {
        beginCreate();
        const query = { ...route.query };
        delete query.device;
        void router.replace({ query });
      }
    }
    status.value =
      'Device deleted. Reusable scenes and schedules were preserved.';
  } catch (failure) {
    error.value = errorText(failure);
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
        Devices
      </p>
      <h1 class="text-3xl font-semibold md:text-4xl">Your physical panels</h1>
      <p class="max-w-3xl text-sm leading-6 text-[var(--muted-text)]">
        Name each device and choose exactly one source: a fixed scene or a
        reusable schedule. You can change this remotely without reconfiguring
        the device over USB.
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
    <p v-if="loading" role="status">Loading devices…</p>
    <div
      v-else-if="owner"
      class="grid gap-5 lg:grid-cols-[minmax(240px,1fr)_minmax(0,2fr)] lg:items-start"
    >
      <UCard :ui="{ body: 'space-y-4 p-5 sm:p-5' }">
        <div class="flex items-center justify-between gap-3">
          <h2 class="text-lg font-semibold">
            Devices
            <span class="text-sm font-normal text-[var(--muted-text)]"
              >({{ displays.length }})</span
            >
          </h2>
          <button
            type="button"
            class="rounded-lg bg-[var(--panel-text)] px-3 py-2 text-sm font-semibold text-white"
            @click="beginCreate"
          >
            + New
          </button>
        </div>
        <p
          v-if="!displays.length"
          class="rounded-lg border border-dashed border-[var(--panel-border)] p-4 text-sm text-[var(--muted-text)]"
        >
          No devices yet. Save a scene first, then add your panel.
        </p>
        <div class="space-y-2">
          <div v-for="device in displays" :key="device.id" class="flex items-stretch gap-2">
            <button
              type="button"
              :aria-pressed="selectedId === device.id"
              class="min-w-0 flex-1 rounded-lg border px-4 py-3 text-left text-sm transition"
              :class="
                selectedId === device.id
                  ? 'border-[var(--panel-text)] bg-sky-50'
                  : 'border-[var(--panel-border)] bg-white hover:border-slate-400'
              "
              @click="selectDevice(device)"
            >
              <span class="block font-semibold">{{ device.name || device.display_id }}</span>
              <span class="mt-1 block font-mono text-xs text-[var(--muted-text)]">{{ device.display_id }}</span>
            </button>
            <button
              type="button"
              :aria-label="'Delete device ' + (device.name || device.display_id)"
              class="self-center rounded-lg border border-rose-200 p-2.5 text-rose-700 hover:bg-rose-50"
              @click="pendingDelete = device"
            >
              <UIcon name="i-lucide-trash-2" class="size-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      </UCard>
      <UCard :ui="{ body: 'space-y-5 p-5 sm:p-6' }">
        <div>
          <p
            class="text-xs font-semibold uppercase tracking-widest text-[var(--muted-text)]"
          >
            {{ creating ? 'Add device' : 'Device settings' }}
          </p>
          <h2 class="mt-1 text-xl font-semibold">
            {{
              creating
                ? 'Configure a new panel'
                : selected?.name || 'Edit device'
            }}
          </h2>
        </div>
        <p
          v-if="loadingDevice"
          role="status"
          class="text-sm text-[var(--muted-text)]"
        >
          Loading selected scene or schedule…
        </p>
        <div
          v-else-if="!creating && effective"
          class="space-y-1 rounded-lg bg-slate-50 p-4"
        >
          <p
            class="text-xs font-semibold uppercase tracking-widest text-[var(--muted-text)]"
          >
            Currently showing
          </p>
          <p class="font-semibold">{{ label }}</p>
          <p class="text-xs text-[var(--muted-text)]">
            {{
              effective.reason === 'schedule'
                ? 'Controlled by shared schedule'
                : 'Fixed scene'
            }}
          </p>
        </div>
        <form class="space-y-5" @submit.prevent="saveDevice">
          <label class="block space-y-1.5 text-sm font-medium">
            <span>Device name</span>
            <input
              v-model="name"
              required
              maxlength="120"
              :class="fieldClass"
              placeholder="e.g. Hallway panel"
            />
          </label>
          <fieldset class="space-y-3">
            <legend class="text-sm font-semibold">
              What controls this device?
            </legend>
            <div class="grid gap-3 sm:grid-cols-2">
              <label
                class="flex cursor-pointer items-start gap-2 rounded-xl border p-4 has-[:checked]:border-sky-700 has-[:checked]:bg-sky-50"
              >
                <input
                  v-model="targetKind"
                  type="radio"
                  value="scene"
                  class="mt-1"
                  @change="chooseTarget('scene')"
                />
                <span
                  ><strong class="block text-sm">Fixed scene</strong
                  ><span class="text-xs text-[var(--muted-text)]"
                    >Always display the same scene</span
                  ></span
                >
              </label>
              <label
                class="flex cursor-pointer items-start gap-2 rounded-xl border p-4 has-[:checked]:border-sky-700 has-[:checked]:bg-sky-50"
              >
                <input
                  v-model="targetKind"
                  type="radio"
                  value="schedule"
                  class="mt-1"
                  @change="chooseTarget('schedule')"
                />
                <span
                  ><strong class="block text-sm">Schedule</strong
                  ><span class="text-xs text-[var(--muted-text)]"
                    >Change scenes by time; Off between windows</span
                  ></span
                >
              </label>
            </div>
          </fieldset>
          <div class="space-y-2">
            <label for="device-target" class="block text-sm font-medium"
              >Select {{ targetLabel }}</label
            >
            <select
              id="device-target"
              v-model="targetId"
              :class="fieldClass"
              required
            >
              <option disabled value="">Choose a {{ targetLabel }}</option>
              <option v-for="item in targets" :key="item.id" :value="item.id">
                {{ item.name }}
              </option>
            </select>
            <p v-if="!targets.length" class="text-sm text-amber-800">
              There are no
              {{ targetKind === 'scene' ? 'scenes' : 'schedules' }} yet.
              <RouterLink
                :to="
                  toWorkspace(targetKind === 'scene' ? '/scenes' : '/schedules')
                "
                class="font-medium underline"
                >Create one</RouterLink
              >
              first.
            </p>
            <RouterLink
              v-else
              :to="
                toWorkspace(targetKind === 'scene' ? '/scenes' : '/schedules')
              "
              class="inline-block text-xs font-semibold underline"
              >Manage
              {{ targetKind === 'scene' ? 'scenes' : 'schedules' }}</RouterLink
            >
          </div>
          <div
            class="flex flex-wrap gap-2 border-t border-[var(--panel-border)] pt-4"
          >
            <button
              type="submit"
              :disabled="!canSave || loadingDevice"
              class="rounded-lg bg-[var(--panel-text)] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              {{ saving ? 'Saving…' : creating ? 'Add device' : 'Save device' }}
            </button>
            <RouterLink
              v-if="selected"
              :to="'/device?display=' + encodeURIComponent(selected.id)"
              class="rounded-lg border border-[var(--panel-border)] bg-white px-4 py-2.5 text-sm font-medium"
              >Configure over USB</RouterLink
            >
            <RouterLink
              v-if="selected"
              :to="'/display/' + encodeURIComponent(selected.id)"
              class="rounded-lg border border-[var(--panel-border)] bg-white px-4 py-2.5 text-sm font-medium"
              >Live preview</RouterLink
            >
          </div>
        </form>
        <div
          v-if="selected"
          class="space-y-3 border-t border-[var(--panel-border)] pt-4"
        >
          <p class="text-xs text-[var(--muted-text)]">
            Hardware display ID: <code>{{ selected.display_id }}</code
            >. This ID is permanent and remains in the firmware.
          </p>
          <button
            type="button"
            class="text-sm font-medium text-rose-700 underline"
            @click="pendingDelete = selected"
          >
            Delete device…
          </button>
        </div>
      </UCard>
    </div>
    <ConfirmDeleteDialog
      :open="!!pendingDelete"
      kind="device"
      :name="pendingDelete?.name || pendingDelete?.display_id || ''"
      :loading="deleting"
      @update:open="if (!$event) pendingDelete = null"
      @confirm="removeDevice"
    />
  </section>
</template>
