<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { DisplayRecord } from '@/api/types';
import { listDisplays } from '@/lib/config-api';
const displayId = defineModel<string>('displayId', { required: true });
const props = defineProps<{ ownerId: string | null; serviceOrigin: string }>();
const ownerInput = ref(
  props.ownerId ?? window.localStorage.getItem('slpanel.owner-id'),
);
const owner = computed({
  get: () => ownerInput.value ?? displayId.value.split('-')[0],
  set: (value) => {
    ownerInput.value = value.trim();
  },
});
const validOwner = computed(() => /^[A-Za-z0-9]{8}$/.test(owner.value));
const service = computed(() => props.serviceOrigin.trim().replace(/\/+$/, ''));
const validService = computed(() => {
  try {
    const url = new URL(service.value);
    return (
      url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash
    );
  } catch {
    return false;
  }
});
const result = ref<{
  owner: string;
  service: string;
  displays: DisplayRecord[];
  error?: string;
} | null>(null);
const current = computed(() =>
  result.value?.owner === owner.value && result.value.service === service.value
    ? result.value
    : null,
);
const items = computed(
  () =>
    current.value?.displays.map((display) => ({
      value: display.id,
      label:
        display.name + (display.site_name ? ` — ${display.site_name}` : ''),
    })) ?? [],
);
const selected = computed({
  get: () =>
    items.value.some((item) => item.value === displayId.value)
      ? displayId.value
      : undefined,
  set: (value) => {
    if (value) displayId.value = value;
  },
});
const placeholder = computed(() =>
  !validOwner.value
    ? 'Enter an 8-character owner ID'
    : !validService.value
      ? 'Enter a valid HTTPS Service URL'
      : !current.value
        ? 'Loading displays…'
        : 'Choose a display',
);
watch(
  () => [owner.value, service.value],
  (_value, _previous, onCleanup) => {
    if (!validOwner.value || !validService.value) return;
    const controller = new AbortController();
    onCleanup(() => controller.abort());
    const requestedOwner = owner.value;
    const requestedService = service.value;
    listDisplays(requestedOwner, controller.signal, requestedService)
      .then((displays) => {
        if (!controller.signal.aborted)
          result.value = {
            owner: requestedOwner,
            service: requestedService,
            displays,
          };
      })
      .catch(() => {
        if (!controller.signal.aborted)
          result.value = {
            owner: requestedOwner,
            service: requestedService,
            displays: [],
            error:
              'Could not load displays. You can still enter a Display ID below.',
          };
      });
  },
  { immediate: true },
);
</script>
<template>
  <div class="space-y-2">
    <UFormField label="Owner ID" name="device-display-owner">
      <UInput
        id="device-display-owner"
        v-model="owner"
        placeholder="Your 8-character owner ID"
        class="w-full"
      />
    </UFormField>
    <UFormField label="Saved display" name="device-saved-display">
      <USelect
        id="device-saved-display"
        v-model="selected"
        :items="items"
        :placeholder="placeholder"
        :disabled="!items.length"
        class="w-full"
      />
    </UFormField>
    <p
      v-if="current?.error"
      role="status"
      class="text-xs leading-5 text-[var(--muted-text)]"
    >
      {{ current.error }}
    </p>
    <p
      v-else-if="current && !current.displays.length"
      class="text-xs leading-5 text-[var(--muted-text)]"
    >
      No saved displays for this owner at the Service URL. Enter an ID below or
      create a display on that service.
    </p>
  </div>
</template>
