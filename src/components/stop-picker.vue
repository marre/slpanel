<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { searchStops } from '@/lib/config-api';
import type { StopSearchResult } from '@/api/types';
const props = defineProps<{ siteId: string | null; siteName: string | null }>();
const emit = defineEmits<{ select: [stop: StopSearchResult | null] }>();
const search = ref('');
const results = ref<StopSearchResult[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);
const selected = computed(() =>
  props.siteId
    ? {
        site_id: props.siteId,
        name: props.siteName ?? props.siteId,
        stop_area_name: '',
        stopType: '',
      }
    : null,
);
const items = computed(() => [
  ...(selected.value &&
  !results.value.some((stop) => stop.site_id === selected.value?.site_id)
    ? [selected.value]
    : []),
  ...results.value.map(({ type, ...stop }) => ({ ...stop, stopType: type })),
]);
watch(search, (term, _previous, onCleanup) => {
  results.value = [];
  error.value = null;
  loading.value = false;
  if (term.trim().length < 2) return;
  const controller = new AbortController();
  const timer = window.setTimeout(async () => {
    loading.value = true;
    try {
      const stops = await searchStops(term.trim(), controller.signal);
      if (!controller.signal.aborted) results.value = stops;
    } catch (failure) {
      if (!controller.signal.aborted)
        error.value =
          failure instanceof Error
            ? failure.message
            : 'Could not search stops.';
    } finally {
      if (!controller.signal.aborted) loading.value = false;
    }
  }, 200);
  onCleanup(() => {
    clearTimeout(timer);
    controller.abort();
  });
});
function selectStop(
  stop:
    | {
        site_id: string;
        name: string;
        stop_area_name: string;
        stopType: string;
      }
    | null
    | undefined,
) {
  emit(
    'select',
    stop
      ? {
          site_id: stop.site_id,
          name: stop.name,
          stop_area_name: stop.stop_area_name,
          type: stop.stopType,
        }
      : null,
  );
}
</script>
<template>
  <UInputMenu
    id="stop-search"
    v-model:search-term="search"
    :model-value="selected"
    :items="items"
    label-key="name"
    :loading="loading"
    :ignore-filter="true"
    clear
    class="w-full"
    placeholder="e.g. Slussen, Centralen…"
    @update:model-value="selectStop"
  >
    <template #item-label="{ item }">
      <span class="flex flex-col"
        ><span>{{ item.name }}</span
        ><span class="text-xs text-[var(--muted-text)]"
          >{{ item.stop_area_name }} · {{ item.stopType }}</span
        ></span
      >
    </template>
    <template #empty>
      {{
        error ??
        (search.trim().length < 2
          ? 'Type at least 2 characters to search.'
          : 'No stops found.')
      }}
    </template>
  </UInputMenu>
  <p v-if="error" role="alert" class="text-sm text-rose-800">{{ error }}</p>
</template>
