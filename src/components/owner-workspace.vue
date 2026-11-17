<script setup lang="ts">
import { useOwnerWorkspace } from '@/composables/use-owner-workspace';

const { owner, ownerInput, ownerError, loadOwner } = useOwnerWorkspace();
</script>

<template>
  <form
    class="flex w-full flex-wrap items-center gap-2 text-sm md:w-auto"
    aria-label="Choose workspace owner"
    @submit.prevent="loadOwner"
  >
    <label for="header-owner-id" class="shrink-0 font-semibold text-white">
      Owner ID
    </label>
    <input
      id="header-owner-id"
      v-model="ownerInput"
      maxlength="8"
      autocomplete="off"
      spellcheck="false"
      inputmode="text"
      class="min-w-0 flex-1 rounded-md border border-white/40 bg-white px-3 py-2 text-slate-950 placeholder:text-slate-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white sm:w-36 sm:flex-none"
      aria-label="Owner ID"
      aria-describedby="owner-id-help"
      placeholder="8 letters or digits"
    />
    <button
      type="submit"
      class="rounded-md border border-white/60 px-3 py-2 font-semibold text-white transition hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
    >
      {{ owner ? 'Switch' : 'Load' }}
    </button>
    <p v-if="ownerError" role="alert" class="w-full text-sm text-amber-100">
      {{ ownerError }}
    </p>
    <p id="owner-id-help" class="sr-only">
      The selected owner applies across Devices, Scenes and Schedules. It is
      remembered in this browser, but it is not authentication.
    </p>
  </form>
</template>
