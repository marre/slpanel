<script setup lang="ts">
import { computed, toRefs } from 'vue';
const props = defineProps<{
  details: string;
}>();
const { details } = toRefs(props);
const entries = computed(() =>
  Array.from(
    details.value.matchAll(/(?:^|\s)([a-zA-Z][\w]*)=([^\s]*)/g),
    (match) => ({
      key: match[1],
      value: match[2],
    }),
  ),
);
const knownKeys = computed(
  () =>
    new Set(groups.flatMap((group) => group.fields.map((field) => field.key))),
);
const unknown = computed(() =>
  entries.value.filter((entry) => !knownKeys.value.has(entry.key)),
);
import DiagnosticFields from './diagnostic-fields.vue';
import { groups } from './diagnostic-fields';
const reportedGroups = computed(() =>
  groups
    .map((group) => {
      const reported = group.fields.flatMap((field) =>
        entries.value
          .filter((entry) => entry.key === field.key)
          .map((entry) => ({ ...field, value: entry.value })),
      );
      return {
        ...group,
        main: reported.filter((field) => group.summary.includes(field.key)),
        more: reported.filter((field) => !group.summary.includes(field.key)),
      };
    })
    .filter((group) => group.main.length || group.more.length),
);
</script>
<template>
  <div class="space-y-4" aria-label="Diagnostics summary" role="region">
    <p class="text-xs leading-5 text-[var(--muted-text)]">
      Snapshot from the last read. Counters show accumulated activity; stage
      timings show how long the current step has been active.
    </p>
    <UCard
      v-for="group in reportedGroups"
      :key="group.title"
      as="section"
      :ui="{ body: 'p-4 sm:p-4' }"
    >
      <h4 class="text-sm font-semibold">{{ group.title }}</h4>
      <p class="mt-1 text-xs text-[var(--muted-text)]">
        {{ group.description }}
      </p>
      <DiagnosticFields :fields="group.main" />
      <UCollapsible
        v-if="group.more.length"
        class="mt-4 border-t border-[var(--panel-border)] pt-3"
      >
        <UButton
          variant="link"
          color="neutral"
          class="cursor-pointer text-xs text-[var(--muted-text)]"
          :ui="{ base: 'p-0 text-left font-normal' }"
        >
          More {{ group.title.toLowerCase() }} details
        </UButton>
        <template #content>
          <DiagnosticFields :fields="group.more" />
        </template>
      </UCollapsible>
    </UCard>
    <UCard v-if="unknown.length" as="section" :ui="{ body: 'p-4 sm:p-4' }">
      <h4 class="text-sm font-semibold">Additional firmware fields</h4>
      <dl class="mt-3 space-y-2">
        <div
          v-for="(field, index) in unknown"
          :key="index"
          class="flex flex-wrap justify-between gap-2 text-sm"
        >
          <dt class="font-mono">{{ field.key }}</dt>
          <dd class="break-all">{{ field.value }}</dd>
        </div>
      </dl>
    </UCard>
    <p v-if="!entries.length" class="text-sm text-[var(--muted-text)]">
      This firmware’s diagnostics are available in the raw view below.
    </p>
  </div>
</template>
