<script setup lang="ts">
import { ref } from 'vue';
import { useOwnerWorkspace } from '@/composables/use-owner-workspace';

const { owner, ownerInput, ownerError, loadOwner } = useOwnerWorkspace();
const editing = ref(false);

function submitOwner() {
  loadOwner();
  if (!ownerError.value) editing.value = false;
}
</script>

<template>
  <div class="relative">
    <button
      type="button"
      class="inline-flex max-w-[118px] items-center gap-1.5 rounded-md border border-white/40 px-2 py-2 text-sm font-medium text-white transition hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white sm:max-w-none sm:px-3"
      aria-controls="header-owner-editor"
      :aria-expanded="editing"
      aria-label="Select owner"
      @click="editing = !editing"
    >
      <UIcon
        name="i-lucide-user-round"
        class="size-4 shrink-0"
        aria-hidden="true"
      />
      <span class="hidden sm:inline">Owner:</span>
      <span class="min-w-0 truncate">{{ owner || 'Select' }}</span>
      <UIcon
        name="i-lucide-chevron-down"
        class="size-3 shrink-0"
        aria-hidden="true"
      />
    </button>
    <form
      v-if="editing"
      id="header-owner-editor"
      class="absolute left-0 top-full z-30 mt-2 w-[min(18rem,calc(100vw-2.5rem))] space-y-3 rounded-lg border border-[var(--panel-border)] bg-white p-4 text-sm text-slate-900 shadow-lg"
      aria-label="Choose workspace owner"
      @submit.prevent="submitOwner"
      @keydown.esc="editing = false"
    >
      <label for="header-owner-id" class="block font-semibold">Owner ID</label>
      <input
        id="header-owner-id"
        v-model="ownerInput"
        maxlength="8"
        autocomplete="off"
        spellcheck="false"
        class="w-full rounded-md border border-slate-300 px-3 py-2 text-slate-950 focus-visible:outline-2 focus-visible:outline-sky-700"
        aria-describedby="owner-id-help"
        placeholder="8 letters or digits"
      />
      <p v-if="ownerError" role="alert" class="text-red-700">
        {{ ownerError }}
      </p>
      <p id="owner-id-help" class="text-xs leading-5 text-slate-600">
        Applies across Devices, Scenes and Schedules. Remembered in this
        browser, but not authentication.
      </p>
      <div class="flex items-center justify-end gap-2">
        <button
          type="button"
          class="rounded-md px-3 py-2 font-medium hover:bg-slate-100"
          @click="editing = false"
        >
          Cancel
        </button>
        <button
          type="submit"
          class="rounded-md bg-[var(--panel-text)] px-3 py-2 font-semibold text-white"
        >
          {{ owner ? 'Switch owner' : 'Load owner' }}
        </button>
      </div>
    </form>
  </div>
</template>
