<script setup lang="ts"></script>
<template>
  <section class="space-y-8">
    <div class="home-hero rounded-lg px-6 py-10 md:px-12 md:py-16">
      <p class="mb-3 font-semibold text-[var(--panel-text)]">
        Your transit display, connected
      </p>
      <h1
        class="max-w-3xl text-4xl font-bold leading-tight tracking-tight md:text-6xl"
      >
        Real-time SL transit displays
      </h1>
      <p class="mt-5 max-w-2xl text-lg leading-8 text-[var(--muted-text)]">
        The next departure, at a glance. Choose your stop, personalise your
        board, and bring live departures to your panel.
      </p>
      <div class="mt-8 flex flex-wrap gap-3">
        <RouterLink
          to="/config"
          class="rounded border border-[var(--panel-text)] bg-[var(--panel-text)] px-6 py-3 font-semibold text-white transition hover:bg-[var(--panel-text-soft)]"
        >
          Set up a display <span aria-hidden="true">→</span>
        </RouterLink>
        <RouterLink
          to="/display/demo-board"
          class="rounded border border-[var(--panel-text)] bg-white px-6 py-3 font-semibold text-[var(--panel-text)] transition hover:bg-sky-50"
        >
          Try the demo board <span aria-hidden="true">→</span>
        </RouterLink>
      </div>
    </div>
    <div>
      <h2 class="mb-5 text-2xl font-bold md:text-3xl">Get your panel ready</h2>
      <div class="grid gap-5 md:grid-cols-2">
        <RouterLink to="/config" class="action-card">
          <span class="text-sm font-semibold text-[var(--panel-text)]">
            1. Choose your departures
          </span>
          <h3 class="mt-3 text-2xl font-bold">
            My displays <span aria-hidden="true">→</span>
          </h3>
          <p class="mt-3 leading-7 text-[var(--muted-text)]">
            Find a stop, select lines and directions, and preview your board
            before saving.
          </p>
        </RouterLink>
        <RouterLink to="/device" class="action-card">
          <span class="text-sm font-semibold text-[var(--panel-text)]">
            2. Bring your board to life
          </span>
          <h3 class="mt-3 text-2xl font-bold">
            Connect USB device <span aria-hidden="true">→</span>
          </h3>
          <p class="mt-3 leading-7 text-[var(--muted-text)]">
            Connect your panel, set up Wi-Fi, and link it to a saved display.
          </p>
        </RouterLink>
      </div>
    </div>
  </section>
</template>
