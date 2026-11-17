<script setup lang="ts"></script>
<template>
  <section class="space-y-8">
    <div class="home-hero rounded-lg px-6 py-10 md:px-12 md:py-16">
      <p class="mb-3 font-semibold text-[var(--panel-text)]">Your transit display, connected</p>
      <h1 class="max-w-3xl text-4xl font-bold leading-tight tracking-tight md:text-6xl">
        Real-time SL transit displays
      </h1>
      <p class="mt-5 max-w-2xl text-lg leading-8 text-[var(--muted-text)]">
        See the next departure at a glance. Create a scene, optionally schedule different
        scenes throughout the day, then choose what each physical device displays.
      </p>
      <div class="mt-8 flex flex-wrap gap-3">
        <RouterLink to="/scenes"
          class="rounded border border-[var(--panel-text)] bg-[var(--panel-text)] px-6 py-3 font-semibold text-white transition hover:bg-[var(--panel-text-soft)]">
          Create a scene <span aria-hidden="true">→</span>
        </RouterLink>
        <RouterLink to="/display/demo-board"
          class="rounded border border-[var(--panel-text)] bg-white px-6 py-3 font-semibold text-[var(--panel-text)] transition hover:bg-sky-50">
          Try the demo board <span aria-hidden="true">→</span>
        </RouterLink>
      </div>
    </div>
    <div>
      <h2 class="mb-5 text-2xl font-bold md:text-3xl">Three simple steps</h2>
      <div class="grid gap-5 md:grid-cols-3">
        <RouterLink to="/scenes" class="action-card">
          <span class="text-sm font-semibold text-[var(--panel-text)]">1. Define the content</span>
          <h3 class="mt-3 text-2xl font-bold">Scenes <span aria-hidden="true">→</span></h3>
          <p class="mt-3 leading-7 text-[var(--muted-text)]">
            Find a stop, choose lines and directions, and preview a reusable full-screen scene.
          </p>
        </RouterLink>
        <RouterLink to="/schedules" class="action-card">
          <span class="text-sm font-semibold text-[var(--panel-text)]">2. Choose times (optional)</span>
          <h3 class="mt-3 text-2xl font-bold">Schedules <span aria-hidden="true">→</span></h3>
          <p class="mt-3 leading-7 text-[var(--muted-text)]">
            Show scenes at selected times. The display is automatically Off outside those windows.
          </p>
        </RouterLink>
        <RouterLink to="/devices" class="action-card">
          <span class="text-sm font-semibold text-[var(--panel-text)]">3. Assign to hardware</span>
          <h3 class="mt-3 text-2xl font-bold">Devices <span aria-hidden="true">→</span></h3>
          <p class="mt-3 leading-7 text-[var(--muted-text)]">
            Connect each physical panel to one scene or a shared schedule.
          </p>
        </RouterLink>
      </div>
      <div class="mt-5 rounded-lg border border-[var(--panel-border)] bg-white p-5">
        <p class="text-sm leading-6 text-[var(--muted-text)]">
          First time setting up hardware? <RouterLink to="/device" class="font-semibold text-[var(--panel-text)] underline">Connect USB device</RouterLink>
          to configure Wi-Fi and link its permanent device ID.
        </p>
      </div>
    </div>
  </section>
</template>
