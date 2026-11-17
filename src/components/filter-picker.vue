<script setup lang="ts">
import { computed, ref } from 'vue';
const model = defineModel<string[]>({ required: true });
const props = defineProps<{
  id: string;
  options: {
    value: string;
    label: string;
    transportMode: string;
    lineNumber?: string;
  }[];
  disabled: boolean;
  placeholder: string;
}>();
const search = ref('');
const custom = ref<string[]>([]);
const items = computed(() => {
  const options = [...props.options];
  for (const value of [...model.value, ...custom.value])
    if (!options.some((option) => option.value === value))
      options.push({ value, label: value, transportMode: '' });
  return options;
});
const selectedLabels = computed(() =>
  model.value.map(
    (value) => items.value.find((item) => item.value === value)?.label ?? value,
  ),
);
const selectedSummary = computed(() => {
  const labels = selectedLabels.value;
  if (!labels.length) return props.placeholder;
  if (labels.length <= 2) return labels.join(', ');
  return `${labels[0]} +${labels.length - 1} more`;
});
const selectedTitle = computed(() => selectedLabels.value.join(', '));

function create(value: string) {
  const normalized = value.trim();
  if (normalized && !model.value.includes(normalized)) {
    custom.value.push(normalized);
    model.value = [...model.value, normalized];
  }
  search.value = '';
}
</script>
<template>
  <USelectMenu
    :id="id"
    v-model="model"
    v-model:search-term="search"
    :items="items"
    value-key="value"
    multiple
    :search-input="{ placeholder: 'Search or add a value…' }"
    create-item
    :disabled="disabled"
    :placeholder="placeholder"
    class="w-full"
    :ui="{ base: 'h-10 min-h-10' }"
    @create="create"
  >
    <template #default>
      <span
        class="block min-w-0 flex-1 truncate text-left text-sm"
        :class="
          model.length ? 'text-[var(--app-text)]' : 'text-[var(--muted-text)]'
        "
        :title="model.length ? selectedTitle : undefined"
      >
        {{ selectedSummary }}
      </span>
    </template>
    <template #item-label="{ item }">
      {{ item.label }}
      <span class="text-xs text-[var(--muted-text)]"
        >{{ item.lineNumber ? `· Line ${item.lineNumber}` : '' }}
        {{ item.transportMode }}</span
      >
    </template>
  </USelectMenu>
</template>
