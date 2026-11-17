<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  open: boolean;
  kind: 'device' | 'scene' | 'schedule';
  name: string;
  loading: boolean;
}>();
const emit = defineEmits<{
  'update:open': [value: boolean];
  confirm: [];
}>();

const title = computed(() => `Delete ${props.kind}?`);
const description = computed(() => {
  const item = `“${props.name}”`;
  if (props.kind === 'device') {
    return `Delete device ${item}? Its physical hardware will not be erased. Scenes and schedules are preserved.`;
  }
  if (props.kind === 'scene') {
    return `Delete scene ${item}? Devices and schedules using it must be reassigned first. Its stop configuration is preserved.`;
  }
  return `Delete schedule ${item}? Devices using it must be reassigned first. Scenes remain unchanged.`;
});
</script>

<template>
  <UModal
    :open="open"
    :title="title"
    :description="description"
    :dismissible="!loading"
    :ui="{ footer: 'justify-end' }"
    @update:open="emit('update:open', $event)"
  >
    <template #footer>
      <UButton
        color="neutral"
        variant="outline"
        :disabled="loading"
        @click="emit('update:open', false)"
      >
        Cancel
      </UButton>
      <UButton
        color="error"
        :loading="loading"
        :disabled="loading"
        @click="emit('confirm')"
      >
        Delete {{ kind }}
      </UButton>
    </template>
  </UModal>
</template>
