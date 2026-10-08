<script setup lang="ts"></script>
<template>
  <section class="space-y-4">
    <p
      class="text-[0.7rem] uppercase tracking-[0.22em] text-[var(--muted-text)]"
    >
      Page not found
    </p>
    <div class="space-y-3">
      <h2 class="text-3xl font-semibold text-[var(--panel-text)]">
        That board does not exist.
      </h2>
      <p
        class="max-w-2xl text-sm leading-7 text-[var(--muted-text)] md:text-base"
      >
        Check the link or return to the overview to pick a display.
      </p>
    </div>
    <RouterLink
      to="/display/demo-board"
      class="inline-flex rounded-full border border-[var(--panel-border)] px-5 py-3 text-sm font-medium text-[var(--panel-text)] transition hover:border-[var(--panel-text)]/60 hover:bg-[var(--panel-text)]/8"
    >
      View demo board
    </RouterLink>
  </section>
</template>
