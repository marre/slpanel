<script setup lang="ts">
import { formatValue, type Field } from './diagnostic-fields';
defineProps<{ fields: (Field & { value: string })[] }>();
</script>
<template>
  <dl class="mt-4 space-y-4">
    <div
      v-for="(field, index) in fields"
      :key="`${field.key}-${index}`"
      class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1"
    >
      <dt class="min-w-0 flex-1 text-sm font-medium" :title="field.key">
        {{ field.label }}
        <p class="mt-1 text-xs font-normal leading-5 text-[var(--muted-text)]">
          {{ field.description }}
        </p>
      </dt>
      <dd
        class="max-w-48 break-words text-right text-sm text-[var(--panel-text)]"
        :title="field.value"
      >
        {{ formatValue(field.value, field.format, field.key) }}
      </dd>
    </div>
  </dl>
</template>
