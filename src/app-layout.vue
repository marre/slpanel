<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRoute } from 'vue-router';

const route = useRoute();
const isHome = computed(() => route.path === '/');
const menuOpen = ref(false);
const menuButton = ref<HTMLButtonElement | null>(null);
const navigation = [
  {
    to: '/',
    label: 'Overview',
  },
  {
    to: '/config',
    label: 'My displays',
  },
  {
    to: '/device',
    label: 'USB device',
  },
];
</script>
<template>
  <div class="min-h-screen bg-[var(--app-bg)] text-[var(--app-text)]">
    <a href="#main-content" class="skip-link"> Skip to content </a>
    <header class="bg-[var(--panel-text)] text-white">
      <div class="mx-auto max-w-7xl px-5 md:px-8">
        <div class="relative flex h-24 items-center justify-end md:h-32">
          <RouterLink
            to="/"
            class="absolute left-1/2 top-4 flex -translate-x-1/2 flex-col items-center gap-1 md:top-6"
            aria-label="SLPanel overview"
            @click="menuOpen = false"
          >
            <span
              aria-hidden="true"
              class="grid size-12 place-items-center rounded-full border-[3px] border-white text-xl font-bold md:size-16 md:text-2xl"
            >
              SP
            </span>
            <span class="text-xs font-semibold tracking-wide md:text-sm">
              SLPanel
            </span>
          </RouterLink>
          <button
            ref="menuButton"
            type="button"
            class="flex items-center gap-3 rounded px-2 py-3 text-lg transition hover:bg-white/10 md:text-xl"
            :aria-expanded="menuOpen"
            aria-controls="primary-navigation"
            @click="menuOpen = !menuOpen"
          >
            <span>{{ menuOpen ? 'Close' : 'Menu' }}</span>
            <svg
              aria-hidden="true"
              width="28"
              height="28"
              viewBox="0 0 28 28"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path v-if="menuOpen" d="m5 5 18 18M23 5 5 23"></path>
              <path v-else d="M3 6h22M3 14h22M3 22h22"></path>
            </svg>
          </button>
        </div>
        <nav
          id="primary-navigation"
          aria-label="Primary"
          :class="`${menuOpen ? 'flex' : 'hidden'} w-full flex-col gap-1 border-t border-white/30 py-3 md:flex-row md:justify-center md:gap-4`"
          @keydown="
            (event) => {
              if (event.key === 'Escape') {
                menuOpen = false;
                menuButton?.focus();
              }
            }
          "
        >
          <template v-for="item in navigation" :key="item.to">
            <RouterLink
              :to="item.to"
              :aria-current="route.path === item.to ? 'page' : undefined"
              :class="`border-b-4 px-3 py-3 text-lg font-semibold transition hover:bg-white/10 ${route.path === item.to ? 'border-white' : 'border-transparent'}`"
              @click="menuOpen = false"
            >
              {{ item.label }}
            </RouterLink>
          </template>
        </nav>
      </div>
    </header>
    <div
      v-if="isHome"
      class="h-48 overflow-hidden bg-[#24333c] md:h-80"
      aria-hidden="true"
    >
      <img
        src="/images/metro-station.webp"
        alt=""
        :width="1536"
        :height="512"
        fetchPriority="high"
        class="h-full w-full object-cover object-center"
      />
    </div>
    <main
      id="main-content"
      :tabIndex="-1"
      :class="`relative mx-auto max-w-7xl px-5 pb-8 md:px-8 md:pb-10 ${isHome ? '-mt-12 pt-0' : 'py-8 md:py-10'}`"
    >
      <RouterView></RouterView>
    </main>
    <footer class="mt-8 border-t border-[var(--panel-border)] bg-white">
      <div
        class="mx-auto flex max-w-7xl flex-wrap justify-between gap-4 px-5 py-8 text-sm text-[var(--muted-text)] md:px-8"
      >
        <p>SLPanel · Your transit display, connected</p>
        <p>Independent project. Not affiliated with SL.</p>
      </div>
    </footer>
  </div>
</template>
