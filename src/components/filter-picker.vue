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
  <UInputMenu
    :id="id"
    v-model="model"
    v-model:search-term="search"
    :items="items"
    value-key="value"
    multiple
    create-item
    :disabled="disabled"
    :placeholder="placeholder"
    class="w-full"
    @create="create"
  >
    <template #item-label="{ item }">
      {{ item.label }}
      <span class="text-xs text-[var(--muted-text)]"
        >{{ item.lineNumber ? `· Line ${item.lineNumber}` : '' }}
        {{ item.transportMode }}</span
      >
    </template>
  </UInputMenu>
</template>
