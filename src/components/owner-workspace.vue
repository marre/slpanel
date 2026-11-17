<script setup lang="ts">
import { useOwnerWorkspace } from '@/composables/use-owner-workspace';
const { owner, ownerInput, ownerError, loadOwner } = useOwnerWorkspace();
</script>
<template>
  <form class="flex flex-wrap items-end gap-3 rounded-xl border border-[var(--panel-border)] bg-white p-4" @submit.prevent="loadOwner">
    <label class="flex min-w-44 flex-1 flex-col gap-1.5 text-sm font-medium">
      <span>Owner ID</span>
      <input v-model="ownerInput" maxlength="8" autocomplete="off"
        class="w-full rounded-lg border border-[var(--panel-border)] px-3 py-2.5 focus-visible:outline-2 focus-visible:outline-sky-700"
        aria-label="Owner ID" placeholder="8 letters or digits" />
    </label>
    <button type="submit" class="rounded-lg bg-[var(--panel-text)] px-4 py-2.5 text-sm font-semibold text-white">
      {{ owner ? 'Switch owner' : 'Load workspace' }}
    </button>
    <p v-if="ownerError" role="alert" class="w-full text-sm text-rose-700">{{ ownerError }}</p>
    <p class="w-full text-xs text-[var(--muted-text)]">Your last owner ID is remembered in this browser. It does not provide account security.</p>
  </form>
</template>
